"use client";
// The task detail panel (SCREENS.md §10): every field saves on change, no
// Save button, no dirty state. Presentational — the container feeds it the
// task and handles the writes — so the whole contract is testable. Anatomy
// (DESIGN_SYSTEM.md §5 "Detail panel"): the ring and the serif title in a
// header, 48 px field rows that open popovers, then the checklist, tags and
// notes under section labels, and a footer with Complete first; on a phone
// the footer sits above the safe area and the quiet actions fold into a menu.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ruleToSpec, specToRule } from "@/core/quickadd/recurrence";
import { occurrencesAfter } from "@/core/recurrence";
import { formatMinutes, formatTime, localDate, localTime, type Instant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { ChecklistItem, MissPolicy, Priority, TagRef, Task } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Chip, chipButtonClass } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { DateField } from "@/ui/date-field";
import { bareFieldClass, Textarea } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { FIELD_INPUT, MENU_ITEM, MenuButton, useDismiss } from "@/ui/popover";
import { deadlineWording } from "@/ui/relative-day";
import { SectionLabel } from "@/ui/section-label";
import { Grabber, RAISED, Scrim, SHEET_RISE } from "@/ui/sheet";
import { TimeField } from "@/ui/time-field";
import { dayLabel } from "@/features/quickadd/interpret";
import { BLOCK_GLYPH } from "./task-actions";
import { snoozePresets } from "./snooze";

export interface TaskDetailPanelProps {
  task: Task;
  projectName: string | null;
  areaName: string | null;
  projects: readonly { id: string; name: string }[];
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
  onClose: () => void;
  onChecklistAdd?: (title: string) => void;
  onChecklistToggle?: (id: string, done: boolean) => void;
  onChecklistRename?: (id: string, title: string) => void;
  onChecklistRemove?: (id: string) => void;
  onTagAdd?: (name: string) => void;
  onTagRemove?: (tagId: string) => void;
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
 * outside or Escape closes it, and focus goes back to the row.
 */
function FieldRow({ label, value, children }: { label: string; value: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  const rootRef = useDismiss(open, close);

  // Hand focus back to the row once the panel has closed.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
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
            id={panelId}
            role="dialog"
            aria-label={label}
            className={cx(
              RAISED,
              SHEET_RISE,
              "z-40 flex flex-col gap-3",
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
  const [notes, setNotes] = useState(task.notes ?? "");
  const [repeatSpec, setRepeatSpec] = useState("");
  // A change that arrives from elsewhere (another device, the rollover job) replaces the draft.
  const [seen, setSeen] = useState({ title: task.title, notes: task.notes ?? "" });
  if (seen.title !== task.title || seen.notes !== (task.notes ?? "")) {
    setSeen({ title: task.title, notes: task.notes ?? "" });
    setTitle(task.title);
    setNotes(task.notes ?? "");
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
  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTitle(task.title);
      (e.target as HTMLInputElement).blur();
    }
  };
  const applyRepeat = (spec: string) => {
    const parsed = specToRule(spec.trim().replace(/^every\s+/i, ""));
    if (!parsed) return false;
    onPatch({ recurrenceRule: parsed.rule, recurrenceMode: task.recurrenceMode ?? "fixed" });
    setRepeatSpec("");
    return true;
  };

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
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={onTitleKey}
            aria-label="Title"
            className={cx("w-full font-display text-pane font-book text-ink [text-wrap:balance]", BARE, done && "text-ink-3 line-through")}
          />
          {(p.areaName || p.projectName) && <p className="mt-1 text-body-sm text-ink-2">{[p.areaName, p.projectName].filter(Boolean).join(" › ")}</p>}
        </div>
        <Button variant="icon" onClick={p.onClose} aria-label="Close" className="-mr-2">
          <Icon name="close" size={18} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 sm:px-5">
        {/* Field rows run edge to edge under hairlines, the way the direction draws them; each opens its own raised popover. */}
        <div className="-mx-4 mt-1 divide-y divide-line border-y border-line sm:-mx-5">
          <FieldRow label="Do" value={doValue}>
            {(close) => (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={PICK} onClick={() => (onPatch({ doDate: today, doTime: null, evening: false }), close())}>
                    Today
                  </button>
                  {/* "This evening" is the first of these, so the panel never repeats it as a checkbox below. */}
                  {presets.map((s) => (
                    <button key={s.id} type="button" className={PICK} onClick={() => (onPatch(s.patch), close())}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <label className={PANEL_FIELD}>
                  <span className="w-12">Day</span>
                  <DateField aria-label="Day" className="flex-1" today={today} value={task.doDate?.toString() ?? ""} onChange={(e) => onPatch({ doDate: e.target.value ? localDate(e.target.value) : null })} />
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
                {task.doDate && <Clear onClick={() => (onPatch({ doDate: null, doTime: null, evening: false }), close())}>No day</Clear>}
              </>
            )}
          </FieldRow>

          <FieldRow label="Deadline" value={deadlineValue}>
            {(close) => <DatePicker value={task.deadline} today={today} onChange={(d) => (onPatch({ deadline: d }), close())} />}
          </FieldRow>

          <FieldRow label="Starts" value={task.startDate ? formatDay(task.startDate, { today }) : <Muted>—</Muted>}>
            {(close) => <DatePicker value={task.startDate} today={today} onChange={(d) => (onPatch({ startDate: d }), close())} />}
          </FieldRow>

          <FieldRow label="Estimate" value={task.estimateMin ? <Chip>{formatMinutes(task.estimateMin)}</Chip> : <Chip tone="guess">30m?</Chip>}>
            {(close) => (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {ESTIMATES.map((m) => (
                    <button key={m} type="button" className={PICK} aria-pressed={task.estimateMin === m} onClick={() => (onPatch({ estimateMin: m }), close())}>
                      {formatMinutes(m)}
                    </button>
                  ))}
                </div>
                <MinutesInput onSubmit={(m) => (onPatch({ estimateMin: m }), close())} />
                {task.estimateMin != null && <Clear onClick={() => (onPatch({ estimateMin: null }), close())}>No estimate</Clear>}
              </>
            )}
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

          <FieldRow label="Project" value={p.projectName ? <Chip tone="meet">#{p.projectName}</Chip> : <Muted>None</Muted>}>
            {(close) => (
              <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                <button type="button" className={cx(MENU_ITEM, "text-ink-2")} onClick={() => (onPatch({ projectId: null }), close())}>
                  No project
                </button>
                {p.projects.map((pr) => (
                  <button key={pr.id} type="button" aria-pressed={task.projectId === pr.id} className={cx(MENU_ITEM, "aria-pressed:bg-surface-2")} onClick={() => (onPatch({ projectId: pr.id }), close())}>
                    {pr.name}
                  </button>
                ))}
              </div>
            )}
          </FieldRow>

          <FieldRow label="Repeat" value={task.recurrenceRule ? `every ${ruleToSpec(task.recurrenceRule)}${task.recurrenceMode === "after_completion" ? ", after completion" : ""}` : <Muted>Never</Muted>}>
            {(close) => (
              <>
                <input
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
                    <Clear onClick={() => (onPatch({ recurrenceRule: null, recurrenceMode: null }), close())}>Never</Clear>
                  </>
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

        <Checklist items={p.checklist ?? []} onAdd={p.onChecklistAdd} onToggle={p.onChecklistToggle} onRename={p.onChecklistRename} onRemove={p.onChecklistRemove} />

        <Tags tags={p.tags ?? []} allTags={p.allTags ?? []} onAdd={p.onTagAdd} onRemove={p.onTagRemove} />

        <section className="mt-5 flex flex-col gap-2">
          <SectionLabel>Notes</SectionLabel>
          <Textarea
            aria-label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if ((notes.trim() || null) !== (task.notes?.trim() || null)) onPatch({ notes: notes.trim() || null });
            }}
            placeholder="Anything worth remembering."
            rows={4}
            className="resize-y"
          />
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
        {hasQuiet && (
          <div className="sm:hidden">
            <MenuButton label="More actions" direction="up">
              {(close) => (
                <>
                  {task.state !== "someday" && !done && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), p.onSomeday())}>
                      Someday
                    </button>
                  )}
                  {task.state !== "dropped" && (
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), p.onDrop())}>
                      Drop
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

function Checklist({
  items,
  onAdd,
  onToggle,
  onRename,
  onRemove,
}: {
  items: readonly ChecklistItem[];
  onAdd?: (title: string) => void;
  onToggle?: (id: string, done: boolean) => void;
  onRename?: (id: string, title: string) => void;
  onRemove?: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const done = items.filter((i) => i.done).length;
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onAdd?.(title);
    setDraft("");
  };
  return (
    <section className="mt-5 flex flex-col gap-1">
      <SectionLabel detail={items.length > 0 ? `${done} / ${items.length}` : undefined}>Checklist</SectionLabel>
      <ul>
        {items.map((item) => (
          <ChecklistRow key={item.id} item={item} onToggle={onToggle} onRename={onRename} onRemove={onRemove} />
        ))}
        <li className="flex min-h-11 items-center gap-1">
          <span className="-ml-3 flex size-11 shrink-0 items-center justify-center text-ink-3 sm:size-9" aria-hidden="true">
            <Icon name="plus" size={16} />
          </span>
          <input
            aria-label="Add a step"
            placeholder="Add a step"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            className={cx(BARE, "h-11 flex-1 text-body text-ink")}
          />
        </li>
      </ul>
    </section>
  );
}

function ChecklistRow({
  item,
  onToggle,
  onRename,
  onRemove,
}: {
  item: ChecklistItem;
  onToggle?: (id: string, done: boolean) => void;
  onRename?: (id: string, title: string) => void;
  onRemove?: (id: string) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [seen, setSeen] = useState(item.title);
  if (seen !== item.title) {
    setSeen(item.title);
    setTitle(item.title);
  }
  const commit = () => {
    const next = title.trim();
    if (!next) setTitle(item.title);
    else if (next !== item.title) onRename?.(item.id, next);
  };
  return (
    <li className="flex min-h-11 items-center gap-1">
      <Checkbox className="-ml-3" checked={item.done} onChange={(e) => onToggle?.(item.id, e.target.checked)} aria-label={`Done: ${item.title}`} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Backspace" && title === "") {
            e.preventDefault();
            onRemove?.(item.id);
          }
        }}
        aria-label={`Step: ${item.title}`}
        className={cx(BARE, "h-11 flex-1 text-body transition-colors dur-fast", item.done ? "text-ink-3 line-through decoration-ink-3" : "text-ink")}
      />
      <Button variant="icon" onClick={() => onRemove?.(item.id)} aria-label={`Remove step: ${item.title}`} className="-mr-2 text-ink-3">
        <Icon name="close" size={14} />
      </Button>
    </li>
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

function DatePicker({ value, today, onChange }: { value: LocalDate | null; today: LocalDate; onChange: (d: LocalDate | null) => void }) {
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={PICK} onClick={() => onChange(today)}>
          Today
        </button>
        <button type="button" className={PICK} onClick={() => onChange(today.add({ days: 1 }))}>
          Tomorrow
        </button>
        <button type="button" className={PICK} onClick={() => onChange(today.add({ days: 7 }))}>
          In a week
        </button>
      </div>
      <DateField aria-label="Date" className="w-full" today={today} value={value?.toString() ?? ""} onChange={(e) => onChange(e.target.value ? localDate(e.target.value) : null)} />
      {value && <Clear onClick={() => onChange(null)}>Clear</Clear>}
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
