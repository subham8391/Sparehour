"use client";
// The task detail panel (SCREENS.md §10): every field saves on change, no
// Save button, no dirty state. Presentational — the container feeds it the
// task and handles the writes — so the whole contract is testable. Anatomy
// (DESIGN_SYSTEM.md §5 "Detail panel"): the ring and the serif title in a
// header, 48 px field rows that open popovers, then the checklist, tags and
// notes under section labels, and a footer with Complete first; on a phone
// the footer sits above the safe area and the quiet actions fold into a menu.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, useLayoutEffect } from "react";
import { readTypedDate, type TypedDate as TypedDateValue } from "@/core/quickadd/read-date";
import { ruleToSpec, specToRule } from "@/core/quickadd/recurrence";
import { occurrencesAfter } from "@/core/recurrence";
import { compareDates, formatMinutes, formatTime, localDate, localTime, type Instant, type LocalDate, type LocalTime } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { ChecklistItem, MissPolicy, Priority, RecurrenceException, RecurrenceMode, TagRef, Task } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Chip, chipButtonClass } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { DateField } from "@/ui/date-field";
import { bareFieldClass } from "@/ui/field";
import { NoteField } from "@/ui/note-field";
import { Icon } from "@/ui/icons";
import { FIELD_INPUT } from "@/ui/field-popover";
import { MENU_ITEM, MenuButton, useDismiss } from "@/ui/popover";
import { deadlineWording } from "@/ui/relative-day";
import { SectionLabel } from "@/ui/section-label";
import { Grabber, RAISED, Scrim, SHEET_RISE } from "@/ui/sheet";
import { TimeField } from "@/ui/time-field";
import { projectOptionLabel } from "@/data/queries/project-label";
import { dayLabel } from "@/features/quickadd/interpret";
import { Checklist } from "./checklist";
import { repeatPolicy } from "./repeat-policy";
import { PausePicker, pausedUntil, RepeatLine, SeriesPrompt } from "./series-controls";
import { BLOCK_GLYPH } from "./task-actions";
import type { DetailField, FieldRequest } from "./task-detail";
import { snoozePresets, type SnoozePreset } from "./snooze";

export interface TaskDetailPanelProps {
  task: Task;
  projectName: string | null;
  areaName: string | null;
  /** `area` tells two projects of one name apart in the picker (PRODUCT_SPEC.md §5.4). */
  projects: readonly { id: string; name: string; area?: string | null }[];
  /** The areas a task can be filed in directly, after the projects in the Project field's picker (a project or an area, never both). */
  areas?: readonly { id: string; name: string }[];
  /** The headings of the task's project, for the Heading field: the tap path for what a drag does in the project. */
  headings?: readonly { id: string; title: string }[];
  onHeading?: (headingId: string | null) => void;
  checklist?: readonly ChecklistItem[];
  tags?: readonly TagRef[];
  /** Every tag in the space, for suggestions. */
  allTags?: readonly TagRef[];
  now: Instant;
  zone: string;
  today: LocalDate;
  onPatch: (patch: TaskPatch) => void;
  onComplete: () => void;
  onReopen: () => void;
  onSomeday: () => void;
  onDrop: () => void;
  /** Places the task on today's timeline; absent where no day is in view. */
  onBlock?: () => void;
  /** Convert task → project (PRODUCT_SPEC.md §6): the footer's ⋯ and the checklist's ⋯ offer it. */
  onConvert?: () => void;
  /** A copy right after the task, which then opens (SCREENS.md §10 footer ⋯ "Duplicate"). */
  onDuplicate?: () => void;
  /** The `#` and `@` pickers as sheets (SCREENS.md §12 "Move to project · Add tag"): the phone's tap path to them. */
  onMovePicker?: () => void;
  onTagPicker?: () => void;
  /** Copies `<origin>/today?task=<id>` (SCREENS.md §10 footer ⋯ "Copy link"). */
  onCopyLink?: () => void;
  onClose: () => void;
  /** A new step; with `sortKey`, at that place (Enter on a step adds the next one under it). */
  onChecklistAdd?: (title: string, sortKey?: string) => void;
  onChecklistToggle?: (id: string, done: boolean) => void;
  onChecklistRename?: (id: string, title: string) => void;
  onChecklistRemove?: (id: string) => void;
  onChecklistReorder?: (id: string, sortKey: string) => void;
  onTagAdd?: (name: string) => void;
  onTagRemove?: (tagId: string) => void;
  /** A field whose picker opens at once, focused (D, ⇧D, ⇧S, E, R and their palette commands). */
  fieldRequest?: FieldRequest | null;
  // ---- a repeating task's series (SCREENS.md §10 "Recurring"; SYSTEM_DESIGN.md §5.2 "Series edits")
  /** The series' one-off changes (moves and skips), for the header's "next" and the moved-day question. */
  exceptions?: readonly RecurrenceException[];
  /** A new do-date for a repeating task, once the person has said which: this occurrence only, or the rule. */
  onSeriesDay?: (choice: "once" | "rule", change: SeriesDayChange) => void;
  /** A new rule typed in for a task that already repeats: it starts again from today. */
  onChangeRule?: (rule: string, mode: RecurrenceMode) => void;
  onSkipOccurrence?: () => void;
  onPause?: (until: LocalDate) => void;
  onResume?: () => void;
}

/** The new day of an occurrence as the Do field picked it, with the time and evening flag that came with it. */
export interface SeriesDayChange {
  doDate: LocalDate;
  doTime?: LocalTime | null;
  evening?: boolean;
}

const ESTIMATES = [15, 25, 30, 45, 60, 90, 120];
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 0, label: "None" },
  { value: 3, label: "!1 High" },
  { value: 2, label: "!2 Medium" },
  { value: 1, label: "!3 Low" },
];
const MISS_POLICIES: { value: MissPolicy; label: string; help: string }[] = [
  { value: "carry", label: "Carry over", help: "It moves to the next day and counts as carried." },
  { value: "skip", label: "Skip this one", help: "Suits routines — a missed one just doesn't count." },
  { value: "expire", label: "Expire", help: "It goes to the Logbook as missed." },
];

/** A choice inside a panel: the chip that is a button (DESIGN_SYSTEM.md §5 "Chips"). */
const PICK = chipButtonClass();
/** A row inside a panel's list, pressed = surface-2. */
const OPTION = cx(MENU_ITEM, "flex-col items-start justify-center gap-0 py-1.5 aria-pressed:bg-surface-2");
/** An inline text field that draws no box: the shared ring drawn inside, and the underline while typing. */
const BARE = bareFieldClass();
const CHECK_LABEL = "flex items-center gap-1 text-body-sm text-ink-2";
/** A labelled field inside a panel. */
const PANEL_FIELD = "flex items-center gap-2 text-body-sm text-ink-2";

const Muted = ({ children }: { children: ReactNode }) => <span className="font-normal text-ink-3">{children}</span>;
/** A text action inside a panel: "No day", "Clear", "Never". */
const Clear = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <Button variant="link" className="self-start text-ink-2" onClick={onClick}>
    {children}
  </Button>
);

/**
 * A field row and the panel it opens. On a phone the panel is a bottom sheet,
 * so it never covers the rows it belongs to; from `sm` up it is the raised
 * popover anchored under its own row (DESIGN_SYSTEM.md §5 "Sheet"). A click
 * outside or Escape closes it, and focus goes back to the row. `request`
 * opens it from outside (its key, its palette command); each new value opens
 * it again, with focus inside: on its typed field from `sm` up, on the sheet
 * itself on a phone so the keyboard does not cover the choices.
 */
function FieldRow({
  label,
  value,
  request = 0,
  onClosed,
  children,
}: {
  label: string;
  value: ReactNode;
  request?: number;
  /** After the panel has closed, by a choice, Escape or a click outside (the Do field forgets an unanswered question). */
  onClosed?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const closedRef = useRef(onClosed);
  useEffect(() => {
    closedRef.current = onClosed;
  });
  const [open, setOpen] = useState(request > 0);
  const [seenRequest, setSeenRequest] = useState(request);
  const [focusIn, setFocusIn] = useState(request > 0);
  if (request !== seenRequest) {
    setSeenRequest(request);
    if (request > 0) {
      setOpen(true);
      setFocusIn(true);
    }
  }
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const panelId = useId();
  const close = useCallback(() => {
    setOpen(false);
    setFocusIn(false);
  }, []);
  const rootRef = useDismiss(open, close);

  // A frame later, so a closing palette handing focus back cannot take it from the panel.
  useEffect(() => {
    if (!open || !focusIn) return;
    const frame = requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      const phone = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 39.9375rem)").matches;
      (phone ? el : (el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>("input, button") ?? el)).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, focusIn, seenRequest]);

  // Hand focus back to the row once the panel has closed.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      buttonRef.current?.focus();
      closedRef.current?.();
    }
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // The ring is drawn inside, so it never crosses the hairline of a full-bleed row.
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-body hover:bg-hover focus-visible:-outline-offset-2 sm:px-5"
      >
        <span className="text-ink-2">{label}</span>
        <span className="flex min-w-0 items-center gap-2 font-medium text-ink num">{value}</span>
      </button>
      {open && (
        <>
          {/* The sheet's scrim; from `sm` up the panel is a popover, where a click outside is enough. */}
          <Scrim onClose={close} className="fixed z-40 sm:hidden" />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            className={cx(
              RAISED,
              SHEET_RISE,
              "z-40 flex flex-col gap-3 outline-none",
              "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:max-h-[80dvh] max-sm:overflow-y-auto max-sm:rounded-t-sheet max-sm:px-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:shadow-sheet",
              "sm:absolute sm:top-full sm:right-2 sm:z-30 sm:mt-1 sm:w-[calc(100%-1rem)] sm:max-w-80 sm:rounded-xl sm:p-3",
            )}
          >
            <Grabber />
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}

export function TaskDetailPanel(p: TaskDetailPanelProps) {
  const { task, today, onPatch } = p;
  const [title, setTitle] = useState(task.title);
  const [repeatSpec, setRepeatSpec] = useState("");
  // A change that arrives from elsewhere (another device, the rollover job) replaces the draft.
  const [seenTitle, setSeenTitle] = useState(task.title);
  if (seenTitle !== task.title) {
    setSeenTitle(task.title);
    setTitle(task.title);
  }

  const done = task.state === "done";
  const presets = useMemo(() => snoozePresets(p.now, p.zone, today), [p.now, p.zone, today]);
  const repeatPreview = useMemo(() => {
    if (!task.recurrenceRule) return [];
    return occurrencesAfter(task.recurrenceRule, task.doDate ?? today, today, 3);
  }, [task.recurrenceRule, task.doDate, today]);

  const commitTitle = () => {
    const next = title.trim();
    if (next && next !== task.title) onPatch({ title: next });
    else setTitle(task.title);
  };
  const onTitleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTitle(task.title);
      (e.target as HTMLTextAreaElement).blur();
    }
  };
  // The title wraps rather than being cut off mid-word: a textarea that grows with its text (field-sizing where the
  // browser has it, the measured height elsewhere). A title is still one line: a pasted line break becomes a space.
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);
  const applyRepeat = (spec: string) => {
    const parsed = specToRule(spec.trim().replace(/^every\s+/i, ""));
    if (!parsed) return false;
    // A task that already repeats changes its rule: the series starts again from today (SYSTEM_DESIGN.md §5.2).
    if (task.recurrenceRule && p.onChangeRule) {
      if (parsed.rule !== task.recurrenceRule) p.onChangeRule(parsed.rule, task.recurrenceMode ?? "fixed");
    } else onPatch({ recurrenceRule: parsed.rule, recurrenceMode: task.recurrenceMode ?? "fixed", ...repeatPolicy(task, parsed.rule) });
    setRepeatSpec("");
    return true;
  };

  // A new do-date on a repeating task asks first: just this once, or change the rule (SCREENS.md §10). The time
  // alone, the evening flag alone and clearing the day are not asked (DECISIONS.md "Time-only change on a repeat").
  const [pendingDo, setPendingDo] = useState<{ change: SeriesDayChange; focus: boolean } | null>(null);
  const asksSeries = Boolean(task.recurrenceRule && task.doDate && p.onSeriesDay && !done);
  const pickDo = (patch: TaskPatch, close: (() => void) | null) => {
    if (asksSeries && patch.doDate && task.doDate && !patch.doDate.equals(task.doDate)) {
      setPendingDo({ change: { doDate: patch.doDate, doTime: patch.doTime, evening: patch.evening }, focus: close !== null });
      return;
    }
    setPendingDo(null);
    onPatch(patch);
    close?.();
  };
  const answerDo = (choice: "once" | "rule", close: () => void) => {
    if (!pendingDo) return;
    p.onSeriesDay?.(choice, pendingDo.change);
    setPendingDo(null);
    close();
  };
  // Pause repeats… from the footer's menu or the palette opens the Repeat field with its pause picker.
  const [pauseAsked, setPauseAsked] = useState(0);
  const pauseRequest = (p.fieldRequest?.name === "pause" ? p.fieldRequest.seq : 0) + pauseAsked;
  const [pauseOpen, setPauseOpen] = useState(pauseRequest > 0);
  const [seenPauseRequest, setSeenPauseRequest] = useState(pauseRequest);
  if (pauseRequest !== seenPauseRequest) {
    setSeenPauseRequest(pauseRequest);
    if (pauseRequest > 0) setPauseOpen(true);
  }
  const paused = pausedUntil(task, today);
  const repeating = Boolean(task.recurrenceRule) && !done;

  const doValue = task.doDate ? (
    <>
      {dayLabel(task.doDate, today)}
      {task.doTime && <Chip tone="time">{formatTime(task.doTime)}</Chip>}
      {task.evening && !task.doTime && <Chip icon="moon">evening</Chip>}
    </>
  ) : (
    <Muted>No day</Muted>
  );
  const deadlineValue = task.deadline ? <Chip tone={deadlineWording(task.deadline, today).near ? "near" : "deadline"}>{formatDay(task.deadline, { today })}</Chip> : <Muted>—</Muted>;
  /** The open request for a field's picker, as the count its row watches. */
  const asked = (name: DetailField) => (p.fieldRequest?.name === name ? p.fieldRequest.seq : 0);
  const dueBeforeDo = !done && task.deadline != null && task.doDate != null && compareDates(task.deadline, task.doDate) < 0;
  const quietActions = (
    <>
      {task.state !== "someday" && !done && (
        <Button variant="quiet" className="max-sm:hidden" onClick={p.onSomeday}>
          Someday
        </Button>
      )}
      {task.state !== "dropped" && (
        // Drop is undoable, so it stays ink; the deadline role is for Delete alone (DESIGN_SYSTEM.md §2).
        <Button variant="quiet" className="max-sm:hidden" onClick={p.onDrop}>
          Drop
        </Button>
      )}
    </>
  );
  const hasQuiet = (task.state !== "someday" && !done) || task.state !== "dropped";
  // An open or parked task can become a project; a finished, dropped or archived one cannot.
  const onConvert = p.onConvert && !done && task.state !== "dropped" && task.state !== "archived" ? p.onConvert : undefined;
  const seriesActions = repeating && Boolean(p.onSkipOccurrence || p.onPause || p.onResume);
  /** Still open: it can be filed and tagged from the menu. */
  const open = task.state === "inbox" || task.state === "active" || task.state === "someday";

  return (
    // flex-1, not h-full: on the phone the sheet's grabber sits above, and a full height pushed the footer off the screen.
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-2 px-4 pt-2 pb-2 sm:px-5 sm:pt-4">
        <button
          type="button"
          aria-label={done ? "Mark not done" : "Mark done"}
          aria-pressed={done}
          onClick={done ? p.onReopen : p.onComplete}
          className="-ml-3 flex size-11 shrink-0 items-center justify-center rounded-full hover:[&>span]:border-ink motion-safe:active:[&>span]:scale-90"
        >
          <span className={cx("flex size-[22px] items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,transform] dur-fast", done ? "border-ink bg-ink text-ink-inverse" : "border-line-control")}>
            {done && <Icon name="check" size={13} strokeWidth={2.2} />}
          </span>
        </button>
        <div className="min-w-0 flex-1 pt-1.5">
          <textarea
            ref={titleRef}
            rows={1}
            value={title}
            onChange={(e) => setTitle(e.target.value.replace(/\s*[\r\n]+\s*/g, " "))}
            onBlur={commitTitle}
            onKeyDown={onTitleKey}
            aria-label="Title"
            className={cx("block w-full resize-none overflow-hidden font-display text-pane font-book text-ink [field-sizing:content] [text-wrap:balance]", BARE, done && "text-ink-3 line-through")}
          />
          {(p.areaName || p.projectName) && <p className="mt-1 text-body-sm text-ink-2">{[p.areaName, p.projectName].filter(Boolean).join(" › ")}</p>}
          {repeating && <RepeatLine task={task} today={today} exceptions={p.exceptions} onResume={p.onResume} />}
        </div>
        <Button variant="icon" onClick={p.onClose} aria-label="Close" className="-mr-2">
          <Icon name="close" size={18} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-5">
        {/* Field rows run edge to edge under hairlines, the way the direction draws them; each opens its own raised popover. */}
        <div className="-mx-4 mt-1 divide-y divide-line border-y border-line sm:-mx-5">
          <FieldRow label="Do" value={doValue} request={asked("do")} onClosed={() => setPendingDo(null)}>
            {(close) => (
              <>
                <TypedDate now={p.now} zone={p.zone} today={today} withTime onApply={(d) => pickDo({ doDate: d.date, doTime: d.time, evening: d.evening }, close)} />
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={PICK} onClick={() => pickDo({ doDate: today, doTime: null, evening: false }, close)}>
                    Today
                  </button>
                  {/* "This evening" is the first of these, so the panel never repeats it as a checkbox below. */}
                  {presets.map((s) => (
                    <button key={s.id} type="button" className={PICK} onClick={() => pickDo(s.patch, close)}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <label className={PANEL_FIELD}>
                  <span className="w-12">Day</span>
                  <DateField
                    aria-label="Day"
                    className="flex-1"
                    today={today}
                    value={(pendingDo?.change.doDate ?? task.doDate)?.toString() ?? ""}
                    onChange={(e) => pickDo({ doDate: e.target.value ? localDate(e.target.value) : null }, null)}
                  />
                </label>
                <label className={PANEL_FIELD}>
                  <span className="w-12">Time</span>
                  <TimeField
                    aria-label="Time"
                    className="flex-1"
                    value={task.doTime ? task.doTime.toString({ smallestUnit: "minute" }) : ""}
                    onChange={(e) => onPatch({ doTime: e.target.value ? localTime(e.target.value) : null, ...(e.target.value && !task.doDate ? { doDate: today } : {}) })}
                  />
                </label>
                {task.doDate && <Clear onClick={() => pickDo({ doDate: null, doTime: null, evening: false }, close)}>No day</Clear>}
                {pendingDo && (
                  <SeriesPrompt
                    task={task}
                    day={pendingDo.change.doDate}
                    today={today}
                    exceptions={p.exceptions}
                    autoFocus={pendingDo.focus}
                    onOnce={() => answerDo("once", close)}
                    onRule={() => answerDo("rule", close)}
                  />
                )}
              </>
            )}
          </FieldRow>

          <FieldRow label="Deadline" value={deadlineValue} request={asked("deadline")}>
            {(close) => <DatePicker value={task.deadline} today={today} now={p.now} zone={p.zone} presets={presets} onChange={(d) => (onPatch({ deadline: d }), close())} />}
          </FieldRow>

          {dueBeforeDo && (
            // Both dates stay as set (PRODUCT_SPEC.md §5.4): a note in ink-2 with the alert glyph, never a correction.
            <p className="flex min-h-11 flex-wrap items-center gap-x-1.5 px-4 py-1.5 text-body-sm text-ink-2 sm:px-5">
              <Icon name="alert" size={14} className="shrink-0" />
              <span className="mr-auto">Due before you plan to do it</span>
              <Button
                variant="link"
                className="text-ink-2"
                // On a repeat the deadline is this occurrence's, so doing it by then moves this occurrence only.
                onClick={() => (asksSeries && task.deadline ? p.onSeriesDay?.("once", { doDate: task.deadline }) : onPatch({ doDate: task.deadline }))}
              >
                Do it by then
              </Button>
            </p>
          )}

          <FieldRow label="Starts" value={task.startDate ? formatDay(task.startDate, { today }) : <Muted>—</Muted>} request={asked("start")}>
            {(close) => <DatePicker value={task.startDate} today={today} now={p.now} zone={p.zone} presets={presets} onChange={(d) => (onPatch({ startDate: d }), close())} />}
          </FieldRow>

          <FieldRow label="Estimate" value={task.estimateMin ? <Chip>{formatMinutes(task.estimateMin)}</Chip> : <Chip tone="guess">30m?</Chip>} request={asked("estimate")}>
            {(close) => <EstimatePicker value={task.estimateMin} onChange={(m) => (onPatch({ estimateMin: m }), close())} />}
          </FieldRow>

          <FieldRow label="Priority" value={task.priority ? <Chip>{PRIORITIES.find((x) => x.value === task.priority)?.label}</Chip> : <Muted>None</Muted>}>
            {(close) => (
              <div className="flex flex-wrap gap-1.5">
                {PRIORITIES.map((x) => (
                  <button key={x.value} type="button" className={PICK} aria-pressed={task.priority === x.value} onClick={() => (onPatch({ priority: x.value }), close())}>
                    {x.label}
                  </button>
                ))}
              </div>
            )}
          </FieldRow>

          <FieldRow
            label="Project"
            value={p.projectName ? <Chip tone="meet">#{p.projectName}</Chip> : task.areaId && p.areaName ? <Chip>{p.areaName}</Chip> : <Muted>None</Muted>}
          >
            {(close) => (
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                <button type="button" className={cx(MENU_ITEM, "text-ink-2")} onClick={() => (onPatch({ projectId: null }), close())}>
                  No project
                </button>
                {p.projects.map((pr) => (
                  <button key={pr.id} type="button" aria-pressed={task.projectId === pr.id} className={cx(MENU_ITEM, "aria-pressed:bg-surface-2")} onClick={() => (onPatch({ projectId: pr.id }), close())}>
                    {projectOptionLabel(pr, p.projects)}
                  </button>
                ))}
                {/* Or straight into an area, with no project: a loose task in the area view (SCREENS.md §9). */}
                {p.areas && p.areas.length > 0 && (
                  <SectionLabel as="p" className="px-2.5 pt-2">
                    Areas
                  </SectionLabel>
                )}
                {p.areas?.map((a) => (
                  <button key={a.id} type="button" aria-pressed={task.areaId === a.id} aria-label={`Area ${a.name}`} className={cx(MENU_ITEM, "aria-pressed:bg-surface-2")} onClick={() => (onPatch({ areaId: a.id }), close())}>
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </FieldRow>

          {task.projectId && p.headings && p.headings.length > 0 && p.onHeading && (
            <FieldRow label="Heading" value={p.headings.find((h) => h.id === task.headingId)?.title ?? <Muted>None</Muted>}>
              {(close) => (
                <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                  <button type="button" aria-pressed={task.headingId === null} className={cx(MENU_ITEM, "text-ink-2 aria-pressed:bg-surface-2")} onClick={() => (p.onHeading?.(null), close())}>
                    No heading
                  </button>
                  {(p.headings ?? []).map((h) => (
                    <button key={h.id} type="button" aria-pressed={task.headingId === h.id} className={cx(MENU_ITEM, "aria-pressed:bg-surface-2")} onClick={() => (p.onHeading?.(h.id), close())}>
                      {h.title}
                    </button>
                  ))}
                </div>
              )}
            </FieldRow>
          )}

          <FieldRow
            label="Repeat"
            value={task.recurrenceRule ? `every ${ruleToSpec(task.recurrenceRule)}${task.recurrenceMode === "after_completion" ? ", after completion" : ""}` : <Muted>Never</Muted>}
            request={asked("repeat") + pauseRequest}
            onClosed={() => setPauseOpen(false)}
          >
            {(close) => (
              <>
                <input
                  data-autofocus={pauseOpen ? undefined : true}
                  aria-label="Repeat"
                  placeholder="every weekday · every 2 weeks on wed · every month"
                  value={repeatSpec}
                  onChange={(e) => setRepeatSpec(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (applyRepeat(repeatSpec)) close();
                    }
                  }}
                  className={FIELD_INPUT}
                />
                {task.recurrenceRule && (
                  <>
                    <p className="text-body-sm text-ink-2 num">Next: {repeatPreview.map((d) => formatDay(d, { today })).join(" · ")}</p>
                    <label className={CHECK_LABEL}>
                      <Checkbox className="-ml-3" checked={task.recurrenceMode === "after_completion"} onChange={(e) => onPatch({ recurrenceMode: e.target.checked ? "after_completion" : "fixed" })} />
                      Count from when I complete it
                    </label>
                    <Clear onClick={() => (onPatch({ recurrenceRule: null, recurrenceMode: null, ...repeatPolicy(task, null) }), close())}>Never</Clear>
                  </>
                )}
                {seriesActions && (
                  // This occurrence and the pause: kept apart from If missed → Skip, which is a policy, not an action.
                  <div className="flex flex-col gap-1 border-t border-line pt-2">
                    {p.onSkipOccurrence && !paused && <Clear onClick={() => (p.onSkipOccurrence?.(), close())}>Skip this occurrence</Clear>}
                    {paused ? (
                      <p className="flex min-h-11 flex-wrap items-center gap-x-2 text-body-sm text-ink-2 sm:min-h-9">
                        Paused until {formatDay(paused, { today })}
                        {p.onResume && <Clear onClick={() => (p.onResume?.(), close())}>Resume</Clear>}
                      </p>
                    ) : (
                      p.onPause &&
                      (pauseOpen ? (
                        <PausePicker
                          today={today}
                          onPause={(until) => {
                            p.onPause?.(until);
                            close();
                          }}
                        />
                      ) : (
                        <Clear onClick={() => setPauseOpen(true)}>Pause repeats until…</Clear>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </FieldRow>

          <FieldRow label="If missed" value={MISS_POLICIES.find((m) => m.value === task.missPolicy)?.label}>
            {(close) => (
              <div className="flex flex-col gap-0.5">
                {MISS_POLICIES.map((m) => (
                  <button key={m.value} type="button" aria-pressed={task.missPolicy === m.value} className={OPTION} onClick={() => (onPatch({ missPolicy: m.value }), close())}>
                    <span className="block text-body text-ink">{m.label}</span>
                    <span className="block text-body-sm text-ink-2">{m.help}</span>
                  </button>
                ))}
              </div>
            )}
          </FieldRow>
        </div>

        <Checklist items={p.checklist ?? []} onAdd={p.onChecklistAdd} onToggle={p.onChecklistToggle} onRename={p.onChecklistRename} onRemove={p.onChecklistRemove} onReorder={p.onChecklistReorder} onConvert={onConvert} />

        <Tags tags={p.tags ?? []} allTags={p.allTags ?? []} onAdd={p.onTagAdd} onRemove={p.onTagRemove} />

        <section className="mt-5 flex flex-col gap-2">
          <SectionLabel>Notes</SectionLabel>
          {/* Markdown, drawn at rest and edited in place (SCREENS.md §10); the renderer is its own lazy chunk. */}
          <NoteField value={task.notes} onSave={(next) => onPatch({ notes: next })} label="Notes" placeholder="Anything worth remembering." />
        </section>

        {(task.carryCount > 0 || task.lastCarriedAt) && (
          <p className="mt-4 text-body-sm text-ink-3">
            Carried over {task.carryCount} {task.carryCount === 1 ? "time" : "times"}
            {task.lastCarriedAt && `, last ${dayLabel(task.lastCarriedAt, today).toLowerCase()}`}
          </p>
        )}
      </div>

      {/* Complete first, Block beside it; Someday and Drop stay quiet on the right, and on a phone fold into a menu so the footer fits at 360 px. */}
      <div className="flex items-center gap-2 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <Button variant="primary" className="max-sm:flex-1" onClick={done ? p.onReopen : p.onComplete}>
          {done ? "Reopen" : "Complete"}
        </Button>
        {p.onBlock && !done && (
          <Button variant="secondary" onClick={p.onBlock}>
            {BLOCK_GLYPH}
            Block it
          </Button>
        )}
        <span className="flex-1 max-sm:hidden" />
        {quietActions}
        {(hasQuiet || onConvert || seriesActions || p.onDuplicate || p.onCopyLink) && (
          // On a phone every quiet action is here; from `sm` Someday and Drop are buttons, and the menu stays for a
          // repeat's own actions, Duplicate, Convert to project and Copy link, which live here on every band (SCREENS.md §10 footer ⋯).
          <div className={cx(!seriesActions && !onConvert && !p.onDuplicate && !p.onCopyLink && "sm:hidden")}>
            <MenuButton label="More actions" direction="up">
              {(close) => (
                <>
                  {seriesActions && p.onSkipOccurrence && !paused && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), p.onSkipOccurrence?.())}>
                      Skip this occurrence
                    </button>
                  )}
                  {seriesActions && paused && p.onResume && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), p.onResume?.())}>
                      Resume repeats
                    </button>
                  )}
                  {seriesActions && !paused && p.onPause && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), setPauseAsked((n) => n + 1))}>
                      Pause repeats until…
                    </button>
                  )}
                  {task.state !== "someday" && !done && (
                    <button type="button" role="menuitem" className={cx(MENU_ITEM, "sm:hidden")} onClick={() => (close(), p.onSomeday())}>
                      Someday
                    </button>
                  )}
                  {task.state !== "dropped" && (
                    <button type="button" role="menuitem" className={cx(MENU_ITEM, "sm:hidden")} onClick={() => (close(), p.onDrop())}>
                      Drop
                    </button>
                  )}
                  {open && p.onMovePicker && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), p.onMovePicker?.())}>
                      Move to project…
                    </button>
                  )}
                  {open && p.onTagPicker && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), p.onTagPicker?.())}>
                      Add a tag…
                    </button>
                  )}
                  {p.onDuplicate && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), p.onDuplicate?.())}>
                      Duplicate
                    </button>
                  )}
                  {onConvert && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), onConvert())}>
                      Convert to project
                    </button>
                  )}
                  {p.onCopyLink && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), p.onCopyLink?.())}>
                      Copy link
                    </button>
                  )}
                </>
              )}
            </MenuButton>
          </div>
        )}
      </div>
    </div>
  );
}

function Tags({ tags, allTags, onAdd, onRemove }: { tags: readonly TagRef[]; allTags: readonly TagRef[]; onAdd?: (name: string) => void; onRemove?: (tagId: string) => void }) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const attached = new Set(tags.map((t) => t.id));
  const add = () => {
    const name = draft.trim().replace(/^@/, "");
    if (!name) return;
    onAdd?.(name);
    setDraft("");
  };
  return (
    <section className="mt-5 flex flex-col gap-2">
      <SectionLabel>Tags</SectionLabel>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          // A tag is a neutral chip (green and blue mean time and projects); the remove target keeps 44 px on a phone without stretching the chip.
          <span key={t.id} className="inline-flex h-7 items-center gap-0.5 rounded-sm bg-surface-2 pr-0.5 pl-2 text-body-sm font-medium text-ink-2">
            @{t.name}
            <button type="button" onClick={() => onRemove?.(t.id)} aria-label={`Remove tag ${t.name}`} className="-my-2 flex size-11 items-center justify-center rounded-sm text-ink-3 transition-colors dur-fast hover:text-ink sm:my-0 sm:size-6">
              <Icon name="close" size={11} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          list={listId}
          aria-label="Add a tag"
          placeholder={tags.length ? "add" : "add tag"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          className={cx(BARE, "h-11 min-w-24 flex-1 text-body text-ink sm:h-9")}
        />
        <datalist id={listId}>
          {allTags
            .filter((t) => !attached.has(t.id))
            .map((t) => (
              <option key={t.id} value={t.name} />
            ))}
        </datalist>
      </div>
    </section>
  );
}

/**
 * The typed date at the head of a date popover (SCREENS.md §10): "next tue", "21 oct", "in 3 days", and on the
 * Do field a time too ("fri 3pm"). It is read the way quick-add reads it, the day it resolves to shows below as it
 * is typed, Enter applies it, and words that are not a date change nothing.
 */
export function TypedDate({
  now,
  zone,
  today,
  withTime = false,
  autoFocus = false,
  onApply,
}: {
  now: Instant;
  zone: string;
  today: LocalDate;
  withTime?: boolean;
  /** Focus on mount: the bulk picker, which only a key or the palette opens. */
  autoFocus?: boolean;
  onApply: (d: TypedDateValue) => void;
}) {
  const [text, setText] = useState("");
  const [missed, setMissed] = useState(false);
  const hintId = useId();
  const read = text.trim() ? readTypedDate(text, { now, zone }) : null;
  const preview = read && `${dayLabel(read.date, today)}${withTime ? (read.time ? ` ${formatTime(read.time)}` : read.evening ? ", evening" : "") : ""}`;
  return (
    <div className="flex flex-col gap-1">
      <input
        data-autofocus
        autoFocus={autoFocus}
        aria-label="In words"
        aria-describedby={hintId}
        placeholder={withTime ? "next tue · 21 oct · fri 3pm" : "next tue · 21 oct · in 3 days"}
        value={text}
        autoComplete="off"
        enterKeyHint="done"
        onChange={(e) => {
          setText(e.target.value);
          setMissed(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (read) onApply(withTime ? read : { ...read, time: null, evening: false });
          else if (text.trim()) setMissed(true);
        }}
        className={FIELD_INPUT}
      />
      <p id={hintId} aria-live="polite" className="flex min-h-5 items-center gap-1 text-body-sm text-ink-2 num">
        {missed ? (
          "Didn't catch that"
        ) : preview ? (
          <>
            <Icon name="arrow-right" size={12} className="shrink-0 text-ink-3" />
            {preview}
          </>
        ) : null}
      </p>
    </div>
  );
}

/**
 * The deadline and start-date picker: a typed date, the days the snooze presets land on (a date field has no
 * time, so those that differ only by the hour fold into Today), the calendar, and Clear.
 */
export function DatePicker({
  value,
  today,
  now,
  zone,
  presets,
  autoFocus,
  onChange,
}: {
  value: LocalDate | null;
  today: LocalDate;
  now: Instant;
  zone: string;
  presets: readonly SnoozePreset[];
  autoFocus?: boolean;
  onChange: (d: LocalDate | null) => void;
}) {
  const days = [{ label: "Today", date: today }];
  for (const s of presets) if (!days.some((d) => d.date.equals(s.patch.doDate))) days.push({ label: s.label, date: s.patch.doDate });
  if (!days.some((d) => d.date.equals(today.add({ days: 7 })))) days.push({ label: "In a week", date: today.add({ days: 7 }) });
  return (
    <>
      <TypedDate now={now} zone={zone} today={today} autoFocus={autoFocus} onApply={(d) => onChange(d.date)} />
      <div className="flex flex-wrap gap-1.5">
        {days.map((d) => (
          <button key={d.label} type="button" className={PICK} aria-pressed={value?.equals(d.date) ?? false} onClick={() => onChange(d.date)}>
            {d.label}
          </button>
        ))}
      </div>
      <DateField aria-label="Date" className="w-full" today={today} value={value?.toString() ?? ""} onChange={(e) => onChange(e.target.value ? localDate(e.target.value) : null)} />
      {value && <Clear onClick={() => onChange(null)}>Clear</Clear>}
    </>
  );
}

/** The estimate picker: the preset chips, minutes typed in (focused when the picker is opened by `E`), and No estimate. */
export function EstimatePicker({ value, onChange }: { value: number | null; onChange: (minutes: number | null) => void }) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {ESTIMATES.map((m) => (
          <button key={m} type="button" className={PICK} aria-pressed={value === m} onClick={() => onChange(m)}>
            {formatMinutes(m)}
          </button>
        ))}
      </div>
      <MinutesInput onSubmit={onChange} />
      {value != null && <Clear onClick={() => onChange(null)}>No estimate</Clear>}
    </>
  );
}

function MinutesInput({ onSubmit }: { onSubmit: (minutes: number) => void }) {
  const [v, setV] = useState("");
  const commit = () => {
    const m = Math.round(Number(v));
    if (Number.isFinite(m) && m > 0) onSubmit(m);
  };
  return (
    <label className="flex items-center gap-2 text-body-sm text-ink-2">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        data-autofocus
        aria-label="Minutes"
        placeholder="minutes"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className={cx(FIELD_INPUT, "w-28")}
      />
      <Button variant="secondary" onClick={commit}>
        Set
      </Button>
    </label>
  );
}
