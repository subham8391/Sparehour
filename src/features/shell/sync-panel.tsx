"use client";
// The sync chip's expanded state, second half (SCREENS.md §20): an island loaded when the chip opens (or is
// pointed at). Synced shows the exact last sync, when the calendar was last read and Sync now, which runs the data
// sync and the calendar's (the same path as Settings › Calendar). Storage not protected shows how to install on
// this platform — iPhone's three steps, Safari's Add to Dock, or an Install button where the browser offers one —
// and the persistence line, which follows the browser's answer as it changes.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@/data/powersync";
import { InstallCoaching } from "@/features/pwa/install-coaching";
import { persistenceCopy, type InstallState } from "@/features/pwa/install";
import { usePwaOptional } from "@/features/pwa/pwa-provider";
import { Button } from "@/ui/button";
import type { SyncChipModel } from "./sync-chip";
import { CALENDAR_READ_SQL, syncEverything } from "./sync-everything";

/** "14:02", or "Tue 14:02" when it was not today: the exact time the chip's "12s ago" stands for. */
export function clockTime(at: Date, now: Date = new Date()): string {
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return at.toDateString() === now.toDateString() ? time : `${at.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/** How to install here, as the expanded "Storage not protected" says it (SCREENS.md §20 "Install instructions per platform"). */
export function InstallSteps({ install, onInstall }: { install: InstallState; onInstall: () => void }) {
  switch (install.kind) {
    case "prompt":
      return (
        <Button variant="secondary" className="mt-2 w-full" onClick={onInstall}>
          Install Sparehour
        </Button>
      );
    case "coach-ios":
      return <InstallCoaching steps={install.steps} className="mt-2" />;
    case "coach-safari":
      return (
        <section aria-label="Add Sparehour to your Dock" className="mt-2 flex flex-col gap-1">
          <h3 className="font-medium text-ink">Add Sparehour to your Dock</h3>
          <ol className="flex list-decimal flex-col gap-0.5 pl-5">
            {install.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      );
    case "browser-menu":
      return <p className="mt-2">Open your browser’s menu and choose Install Sparehour, or Add to Home screen.</p>;
    default:
      return null;
  }
}

/** What the chip expands to, in the sidebar's popover or the phone's sheet: the words, what waits, the one action. */
export function SyncDetail({ model }: { model: SyncChipModel }) {
  const pathname = usePathname();
  return (
    <>
      <p className="mb-1 font-medium text-ink">{model.label}</p>
      <p>{model.detail}</p>
      {model.waiting && model.waiting.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-ink">
          {model.waiting.map((w, n) => (
            <li key={n} className="truncate">
              {w}
            </li>
          ))}
          {(model.more ?? 0) > 0 && <li className="text-ink-3 num">+{model.more} more</li>}
        </ul>
      )}
      {model.action === "sign_in" && (
        <Link href={`/login?next=${encodeURIComponent(pathname ?? "/today")}`} className="mt-2 inline-flex min-h-11 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 sm:min-h-0 touch:min-h-11">
          Sign in again
        </Link>
      )}
      {model.action === "export" && (
        <Link href="/settings#data" className="mt-2 inline-flex min-h-11 items-center font-medium text-ink underline decoration-line-strong underline-offset-2 sm:min-h-0 touch:min-h-11">
          Export your data
        </Link>
      )}
      {(model.state === "synced" || model.state === "unprotected" || (model.state === "problem" && model.action !== "export")) && <SyncExtras model={model} />}
    </>
  );
}

export default function SyncExtras({ model }: { model: SyncChipModel }) {
  const pwa = usePwaOptional();
  const { data } = useQuery<{ at: string | null; n: number }>(CALENDAR_READ_SQL);
  const calendar = data?.[0];
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  if (model.state === "unprotected") {
    const installed = pwa?.install.kind === "installed";
    return (
      <div className="mt-2 flex flex-col">
        {pwa && <InstallSteps install={pwa.install} onInstall={() => void pwa.promptInstall()} />}
        {installed && <p className="mt-2 text-ink-3">{persistenceCopy(pwa?.persistence ?? "unknown", true)}</p>}
      </div>
    );
  }

  const run = async () => {
    setBusy(true);
    setSaid(null);
    try {
      setSaid((await syncEverything(Boolean(calendar && calendar.n > 0))).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 flex flex-col gap-1">
      {model.lastSyncedAt && <p className="num">Last synced {clockTime(model.lastSyncedAt)}</p>}
      {calendar && calendar.n > 0 && <p className="num">{calendar.at ? `Calendar read ${clockTime(new Date(calendar.at))}` : "Calendar not read yet"}</p>}
      <Button variant="secondary" size="compact" className="mt-1 self-start" disabled={busy} onClick={() => void run()}>
        {busy ? "Syncing…" : "Sync now"}
      </Button>
      <p role="status" className="text-ink-2">
        {said ?? ""}
      </p>
    </div>
  );
}
