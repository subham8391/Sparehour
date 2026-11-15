"use client";
// "Took" under a completion's toast (DECISIONS.md, amendment 2026-11-15): one optional tap says how long the task
// really took. Four lengths around what it was counted as, and More for the rest of the presets; the pressed one
// is the answer, pressing it again takes the answer back, and Undo on the toast takes it back with the completion.
// An island of the undo provider: fetched in idle time, never in a shell.
import { useEffect, useState, type MouseEvent } from "react";
import { tookChoices } from "@/core/estimates";
import { formatMinutes } from "@/core/time";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { tookRow, writeTook, type TookAsk, type TookRow } from "@/data/repositories/took";
import { learnedIsOld } from "@/features/estimates/learned-store";
import { ESTIMATE_PRESETS } from "@/features/tasks/estimate-presets";
import { chipButtonClass } from "@/ui/chip";
import { cx } from "@/ui/cx";

const PICK = chipButtonClass();

export function TookChips({ ask }: { ask: TookAsk }) {
  // Outside the database provider (tests, the sign-in pages) there is nothing to write on.
  const db = useLocalDatabase() as LocalDatabase | null | undefined;
  const [row, setRow] = useState<TookRow | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [all, setAll] = useState(false);

  // Read at once, while the finished row is still on the device: sync takes it away a moment after it uploads.
  useEffect(() => {
    if (!db) return;
    let here = true;
    tookRow(db, ask).then(
      (found) => {
        if (!here || !found) return;
        setRow(found);
        setPicked(found.actualMin);
      },
      // Unreadable is the same as not there: the toast keeps its words and Undo, and asks nothing.
      () => undefined,
    );
    return () => {
      here = false;
    };
  }, [db, ask]);

  if (!db || !row) return null;
  const lengths = all ? [...new Set([...ESTIMATE_PRESETS, ...(picked == null ? [] : [picked])])].sort((a, b) => a - b) : tookChoices(row.estimateMin, row.defaultMin);
  // A tap lets go of the chip, so the toast's own clock runs again; a key press keeps its place.
  const settle = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail > 0) e.currentTarget.blur();
  };
  const choose = (minutes: number) => {
    const next = picked === minutes ? null : minutes;
    const was = picked;
    setPicked(next);
    // What the estimates learned is asked for again the next time it is looked at: this length is part of it now.
    writeTook(db, ask, row.snapshot, next, was).then(learnedIsOld, () => setPicked(was));
  };
  return (
    // On a phone the four lengths stay on one line that scrolls sideways, so the toast covers two rows of the list,
    // not three; More asks for the rest, and those wrap.
    <div role="group" aria-label="How long it took" className={cx("flex min-w-0 basis-full items-center gap-1.5 pr-2 pb-2", all ? "flex-wrap" : "overflow-x-auto [scrollbar-width:none] sm:flex-wrap")}>
      <span className="pr-0.5 text-body-sm text-ink-2">Took</span>
      {lengths.map((m) => (
        <button key={m} type="button" className={PICK} aria-pressed={picked === m} onClick={(e) => (settle(e), choose(m))}>
          {formatMinutes(m)}
        </button>
      ))}
      <button type="button" className={PICK} aria-expanded={all} onClick={(e) => (settle(e), setAll((v) => !v))}>
        {all ? "Fewer" : "More"}
      </button>
    </div>
  );
}
