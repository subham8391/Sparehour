"use client";
// A notification's tap lands here (SYSTEM_DESIGN.md §7.1, §7.3): with an
// action from a button it is carried out at once; without one (Safari, iOS)
// an action sheet offers the same choices. A copied task link
// (`/today?task=<id>`) lands here too and opens that task's detail, or says
// quietly that the task isn't on this device. Either way the URL is cleaned
// so a reload does not repeat it.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { useBlockRepo } from "@/features/blocking/use-block-repo";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { requestOrganize } from "@/features/tasks/organize";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Button } from "@/ui/button";
import { Sheet } from "@/ui/sheet";
import { actionsFor, type PushAction } from "./actions";
import { parseDeepLink, type DeepLink } from "./push";
import { NOT_HERE, SHEET_TITLES, carryOutPushAction, taskOnDevice } from "./push-action-rules";
import { taskLinkId } from "./push-deep-link";

export { NOT_HERE, taskOnDevice };

/** Carries out a notification's action against the local database. */
export function usePushActions(): (link: DeepLink, action: PushAction) => Promise<void> {
  const router = useRouter();
  const db = useLocalDatabase();
  const tasks = useTaskRepo();
  const blocks = useBlockRepo();
  const detail = useTaskDetail();
  const now = useNow();
  const { today } = useLocalDay(now);
  return useCallback(
    (link, action) => carryOutPushAction(link, action, { db, tasks, blocks, today, openTask: (id) => detail.open(id), go: (page) => router.push(page) }),
    [router, db, tasks, blocks, detail, today],
  );
}

/** Acts on the URL a notification opened; the shell mounts it through push-deep-link.tsx. */
export function DeepLinkHandler() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = params.toString();
  const link = useMemo(() => parseDeepLink(new URLSearchParams(key)), [key]);
  const run = usePushActions();
  const db = useLocalDatabase();
  const detail = useTaskDetail();
  const detailRef = useRef(detail);
  useEffect(() => {
    detailRef.current = detail;
  });
  // A copied link: the task opens in its detail once it is known to be here; the URL is cleaned straight away.
  const linkedTask = useMemo(() => taskLinkId(new URLSearchParams(key)), [key]);
  const [opening, setOpening] = useState<string | null>(null);
  const [seenLinkKey, setSeenLinkKey] = useState<string | null>(null);
  if (linkedTask && seenLinkKey !== key) {
    setSeenLinkKey(key);
    setOpening(linkedTask);
  }
  useEffect(() => {
    if (!opening) return;
    let live = true;
    void taskOnDevice(db, opening).then((here) => {
      if (!live) return;
      if (here) detailRef.current.open(opening);
      else requestOrganize({ kind: "notice", text: NOT_HERE });
      setOpening(null);
    });
    return () => {
      live = false;
    };
  }, [opening, db]);
  useEffect(() => {
    if (linkedTask) router.replace(pathname);
  }, [linkedTask, router, pathname]);
  // A plain tap opens the sheet: derived from the URL while rendering, kept after the URL is cleaned.
  const [sheet, setSheet] = useState<DeepLink | null>(null);
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (link && !link.action && seenKey !== key) {
    setSeenKey(key);
    setSheet(link);
  }

  useEffect(() => {
    if (!link) return;
    const clean = () => router.replace(pathname);
    if (link.action) void run(link, link.action).finally(clean);
    else clean();
  }, [link, run, router, pathname]);

  if (!sheet) return null;
  return <PushActionSheet link={sheet} onPick={(a) => void run(sheet, a).finally(() => setSheet(null))} onClose={() => setSheet(null)} />;
}

/** The same three choices a notification button would offer, as a bottom sheet. */
export function PushActionSheet({ link, onPick, onClose }: { link: DeepLink; onPick: (action: PushAction) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <Sheet label={SHEET_TITLES[link.kind]} onClose={onClose} align="center" width="sm">
      <div className="flex flex-col gap-4 p-5">
        <p className="font-display text-pane font-medium text-ink">{SHEET_TITLES[link.kind]}</p>
        <div className="flex flex-col gap-2">
          {actionsFor(link.kind).map((a, i) => (
            <Button key={a.id} variant={i === 0 ? "primary" : "secondary"} size="sheet" onClick={() => onPick(a.id)}>
              {a.label}
            </Button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
