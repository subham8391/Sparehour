"use client";
// A notification's tap lands here (SYSTEM_DESIGN.md §7.1, §7.3): with an
// action from a button it is carried out at once; without one (Safari, iOS)
// an action sheet offers the same choices. Either way the URL is cleaned so
// a reload does not repeat it.
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { useBlockRepo } from "@/features/blocking/use-block-repo";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Button } from "@/ui/button";
import { Sheet } from "@/ui/sheet";
import { actionsFor, type PushAction } from "./actions";
import { parseDeepLink, type DeepLink } from "./push";

const SNOOZE_MS = 15 * 60 * 1000;

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
    async (link, action) => {
      switch (action) {
        case "start":
          if (link.taskId) detail.open(link.taskId);
          return;
        case "snooze": {
          if (!link.blockId) return;
          const row = await db.getOptional<{ start_at: string; end_at: string }>(`select start_at, end_at from time_blocks where id = ? and deleted_at is null`, [link.blockId]);
          if (!row) return;
          const shift = (iso: string) => new Date(new Date(iso).getTime() + SNOOZE_MS).toISOString();
          await blocks.move(link.blockId, shift(row.start_at), shift(row.end_at));
          return;
        }
        case "today":
          if (link.taskId) await tasks.update(link.taskId, { doDate: today, doTime: null, evening: false }, "Moved {title} to today");
          return;
        case "tomorrow":
          if (link.taskId) await tasks.update(link.taskId, { doDate: today.add({ days: 1 }), doTime: null, evening: false }, "Moved {title} to tomorrow");
          return;
        case "plan":
          router.push("/plan");
          return;
        case "shutdown":
          router.push("/shutdown");
          return;
        case "dismiss":
          return;
      }
    },
    [router, db, tasks, blocks, detail, today],
  );
}

export function PushDeepLink() {
  return (
    <Suspense>
      <DeepLinkInner />
    </Suspense>
  );
}

function DeepLinkInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = params.toString();
  const link = useMemo(() => parseDeepLink(new URLSearchParams(key)), [key]);
  const run = usePushActions();
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

const TITLES: Record<DeepLink["kind"], string> = {
  block_start: "Your block is starting.",
  deadline_eve: "Due tomorrow.",
  deadline_day: "Due today.",
  morning: "Good morning.",
  shutdown: "Wrapping up?",
};

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
    <Sheet label={TITLES[link.kind]} onClose={onClose} align="center" width="sm">
      <div className="flex flex-col gap-4 p-5">
        <p className="font-display text-pane font-medium text-ink">{TITLES[link.kind]}</p>
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
