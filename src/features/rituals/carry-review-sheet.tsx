"use client";
// The morning review sheet (SCREENS.md §2.3a): one row per carried-over task
// with a four-way answer, a picked day for anything else, and two ways out.
// "Done" applies the answers and then records that the day was reviewed;
// "Not now", Escape and the scrim record only that, so nothing is ever lost.
// A bottom sheet on a phone, a centred dialog from `sm` up; the list scrolls
// inside it and the footer keeps the bottom edge above the safe area.
import { useEffect, useRef, useState } from "react";
import { Temporal, formatMinutes, localDate, type Instant, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { Button, buttonClass } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { DateField } from "@/ui/date-field";
import { Segmented } from "@/ui/segmented";
import { Sheet } from "@/ui/sheet";
import { useCarryAsks } from "@/features/rollover/use-carry-asks";
import { DEFAULT_CHOICE, allFromYesterday, applyChoices, reviewLine, type Choice, type ChoiceRepo } from "./carry-review";

/** The dialog's accessible name. */
export const REVIEW_LABEL = "Review carried-over tasks";
const LEAD = "Keep what still matters. The rest can wait, or go.";

type Segment = "keep" | "tomorrow" | "someday" | "drop";
const OPTIONS: readonly { value: Segment; label: string }[] = [
  { value: "keep", label: "Keep" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "someday", label: "Someday" },
  { value: "drop", label: "Drop" },
];
/** A row at the three-carry ask answers the ask instead, in its order (SCREENS.md §2.3): "Break it down" converts it at Done. */
type AskSegment = "keep" | "someday" | "breakdown" | "drop";
const ASK_OPTIONS: readonly { value: AskSegment; label: string }[] = [
  { value: "keep", label: "Keep today" },
  { value: "someday", label: "Someday" },
  { value: "breakdown", label: "Break it down" },
  { value: "drop", label: "Drop" },
];
/** A review answer: the four moves, a picked day, or (at the ask) Break it down. */
type SheetChoice = Choice | "breakdown";

/** What the ask needs from the task repository beyond the moves; `TaskRepo` has both. */
export interface AskRepo {
  markAsked?: (ids: readonly string[], at: string) => Promise<void>;
  convertToProject?: (id: string) => Promise<{ projectId: string } | null>;
}

export interface CarryReviewSheetProps {
  /** The carried-over tasks, in the Carried over section's order. */
  tasks: readonly Task[];
  today: LocalDate;
  /** Where the answers are written; the task repository. */
  repo: ChoiceRepo & AskRepo;
  /** Settings › Planning's ask threshold, the zone and now: the same two-a-day ask as Today (PRODUCT_SPEC.md §8.3.4). */
  carryAskAfter?: number | null;
  zone?: string;
  now?: Instant;
  /** Opens the project a "Break it down" made, once the sheet has closed. */
  onOpenProject?: (projectId: string) => void;
  /** Records that the day was reviewed (day_plans.carry_reviewed_at), whichever way the sheet closed. */
  onStamp: () => void | Promise<void>;
  /** The sheet is done with; the host unmounts it. */
  onClose: () => void;
}

export function CarryReviewSheet({ tasks, today, repo, onStamp, onClose, carryAskAfter = null, zone = "UTC", now, onOpenProject }: CarryReviewSheetProps) {
  const [choices, setChoices] = useState<ReadonlyMap<string, SheetChoice>>(() => new Map());
  const [opened] = useState(() => now ?? Temporal.Now.instant());
  const asks = useCarryAsks(tasks, { carryAskAfter, today, zone, now: now ?? opened, markAsked: repo.markAsked?.bind(repo) });
  // Rows whose "Pick a day" has been opened but not yet answered.
  const [picking, setPicking] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const choiceOf = (id: string): SheetChoice => choices.get(id) ?? DEFAULT_CHOICE;
  const choose = (id: string, choice: SheetChoice) => {
    setChoices((m) => new Map(m).set(id, choice));
    if (typeof choice === "string")
      setPicking((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
  };

  // Focus lands on the heading, so the dialog and its question are read first; Tab reaches the first row.
  useEffect(() => {
    heading.current?.focus();
  }, []);

  const notNow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onStamp();
    } finally {
      onClose();
    }
  };
  const done = async () => {
    if (busy) return;
    setBusy(true);
    const all = new Map<string, Choice>();
    const breakDown: string[] = [];
    for (const t of tasks) {
      const c = choiceOf(t.id);
      if (c === "breakdown") breakDown.push(t.id);
      else all.set(t.id, c);
    }
    let project: string | null = null;
    try {
      await applyChoices(repo, all, today);
      // Each one its own conversion and undo; the first new project opens, cursor in its add row.
      for (const id of breakDown) {
        const out = await repo.convertToProject?.(id);
        project ??= out?.projectId ?? null;
      }
      await onStamp();
    } finally {
      onClose();
      if (project) onOpenProject?.(project);
    }
  };

  // Escape is Not now. Captured, so a view's own keys under the sheet never see it; the handler is read
  // from a ref, so a new closure on every render never re-subscribes.
  const notNowRef = useRef(notNow);
  useEffect(() => {
    notNowRef.current = notNow;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        void notNowRef.current();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <Sheet label={REVIEW_LABEL} onClose={() => void notNow()} align="center" width="lg" className="sm:max-h-[80vh]" data-testid="carry-review">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-1 px-5 pt-2 pb-4 sm:pt-5">
          <h2 ref={heading} tabIndex={-1} className="font-display text-pane font-medium text-balance text-ink outline-none">
            {reviewLine(tasks.length, allFromYesterday(tasks, today))}
          </h2>
          <p className="text-body-sm text-pretty text-ink-2">{LEAD}</p>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto border-t border-line">
          {tasks.map((t) => (
            <Row
              key={t.id}
              task={t}
              today={today}
              ask={asks.has(t.id) && Boolean(repo.convertToProject)}
              choice={choiceOf(t.id)}
              picking={picking.has(t.id)}
              onChoose={(c) => choose(t.id, c)}
              onPick={() => setPicking((s) => new Set(s).add(t.id))}
            />
          ))}
        </ul>
        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 sm:py-4">
          <Button variant="quiet" size="sheet" disabled={busy} onClick={() => void notNow()} className="max-w-32 sm:h-9 sm:w-auto sm:max-w-none sm:text-body">
            Not now
          </Button>
          <Button variant="primary" size="sheet" disabled={busy} onClick={() => void done()} className="flex-1 sm:h-9 sm:w-auto sm:flex-none sm:text-body">
            Done
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * One carried task: the title (two lines on a phone), the carry count and the
 * estimate in the quiet run beneath it, the four-way answer as a segmented
 * control (44 px on touch), and a quiet "Pick a day" that opens a date field
 * for any other day. A picked day leaves every segment unchosen.
 */
function Row({
  task,
  today,
  ask,
  choice,
  picking,
  onChoose,
  onPick,
}: {
  task: Task;
  today: LocalDate;
  /** At the three-carry ask: the ask's four answers take the place of the moves. */
  ask: boolean;
  choice: SheetChoice;
  picking: boolean;
  onChoose: (choice: SheetChoice) => void;
  onPick: () => void;
}) {
  const day = typeof choice === "object" ? choice.day.toString() : "";
  const segment: Segment | AskSegment | "day" = typeof choice === "object" ? "day" : choice;
  return (
    // Phone: a grid where the title spans the row, the quiet run and "Pick a day" share the line under it and the control
    // fills the next; from `sm` one flex row of the title block, the control and the link. The block dissolves on the phone
    // (`contents`) so its two lines place themselves.
    <li className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-line px-5 py-2.5 first:border-t-0 sm:flex sm:justify-between sm:gap-4 sm:py-1.5">
      <div className="max-sm:contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col">
        <p className="col-span-2 line-clamp-2 text-body-lg leading-snug text-ink [overflow-wrap:anywhere] sm:line-clamp-1 sm:leading-5">{task.title}</p>
        <p className="col-start-1 row-start-2 flex items-center gap-1.5 text-label text-ink-2 num sm:mt-0.5">
          {task.carryCount > 1 && <span className="text-ink-3">×{task.carryCount}</span>}
          <Chip tone={task.estimateMin ? "neutral" : "guess"} size="sm">
            {task.estimateMin ? formatMinutes(task.estimateMin) : "30m?"}
          </Chip>
          {ask && <span className="text-over">Carried over {task.carryCount} times — still want this?</span>}
        </p>
      </div>
      {ask ? (
        // Two by two on a phone, where four words do not fit one 44 px rail; one rail from `sm`.
        <Segmented
          label={`Choice for ${task.title}`}
          options={ASK_OPTIONS}
          value={segment}
          onChange={(v) => {
            if (v !== "day") onChoose(v);
          }}
          className="col-span-2 row-start-3 max-sm:grid max-sm:h-auto max-sm:w-full max-sm:grid-cols-2 max-sm:*:h-11 max-sm:*:px-2"
        />
      ) : (
        <Segmented
          label={`Choice for ${task.title}`}
          options={OPTIONS}
          value={segment}
          onChange={(v) => {
            if (v !== "day") onChoose(v);
          }}
          className="col-span-2 row-start-3 max-sm:w-full max-sm:*:flex-1 max-sm:*:px-2"
        />
      )}
      <div className="col-start-2 row-start-2 justify-self-end sm:-ml-3 sm:shrink-0">
        {picking || day ? (
          <DateField aria-label={`Day for ${task.title}`} value={day} today={today} min={today.toString()} autoFocus={picking && !day} onChange={(e) => e.target.value && onChoose({ day: localDate(e.target.value) })} />
        ) : (
          // 44 px on the phone, pulled into the line's spacing so the quiet run keeps its height.
          <button type="button" onClick={onPick} className={cx(buttonClass({ variant: "link", size: "compact" }), "text-ink-2 max-sm:-my-3")}>
            Pick a day
          </button>
        )}
      </div>
    </li>
  );
}
