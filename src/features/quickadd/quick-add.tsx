"use client";
// Quick-add (SCREENS.md §11): one line in, a task out. Tokens are painted in
// place as they complete, the strip below restates the parse as chips, ⏎
// saves and keeps going, ⌘⏎ saves and closes, esc discards (with a one-step
// undo). On a phone it is a bottom sheet docked above the keyboard, headed by
// "← Quick add"; from the narrow band up, a dialog under the top edge
// (DESIGN_SYSTEM.md §5 "Sheet"). Presentational and testable: data arrives as
// props.
import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { parse, type ParseContext, type ParseResult, type Span, type TaskDraft } from "@/core/quickadd";
import type { Instant, LocalDate, LocalTime } from "@/core/time";
import { Button } from "@/ui/button";
import { Chip, chipButtonClass, type ChipTone } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon, type IconName } from "@/ui/icons";
import { Kbd } from "@/ui/kbd";
import { Sheet } from "@/ui/sheet";
import {
  bestProjectMatch,
  escapeProjectTokens,
  interpret,
  projectMatches,
  projectToken,
  resolveProject,
  segments,
  splitPaste,
  type Fact,
  type QuickAddProject,
} from "./interpret";

export interface QuickAddContext {
  now: Instant;
  zone: string;
  today: LocalDate;
  eveningStartsAt?: LocalTime;
}

export interface QuickAddSubmission {
  draft: TaskDraft;
  projectId: string | null;
  /** Set when the user asked for a project that does not exist yet. */
  createProjectName: string | null;
}

/** A save, resolved to the id of the task it created (the paste's undo needs them all). */
export type QuickAddSave = (submission: QuickAddSubmission) => Promise<string | void>;

type Parsed = Extract<ParseResult, { ok: true }>;

/** One line made ready to save: the submission, and the words the notice uses to say where it went. */
interface Filed {
  submission: QuickAddSubmission;
  title: string;
  /** The project it is filed in (found, guessed from a partial name, or to be created). */
  project: string | null;
  /** A `#name` that filed nothing, kept in the title; and whether it was because several projects fit. */
  unfiled: { name: string; several: boolean } | null;
}

/**
 * Where a parsed line goes (PRODUCT_SPEC.md §5.2 "#name"): the project named exactly; else the one project a
 * partial name fits ("#Q4" → Q4 planning); else a new one when asked for. A name that is none of these files
 * nothing, and its words stay in the title rather than vanish (§5.3 rule 7).
 */
function fileLine(text: string, parsed: Parsed, projects: readonly QuickAddProject[], ctx: ParseContext, createAsked: boolean): Filed {
  const { draft } = parsed;
  const name = draft.projectName;
  const exact = resolveProject(name, projects);
  const create = Boolean(name) && !exact && (createAsked || draft.projectCreate);
  const project = exact ?? (name && !create ? bestProjectMatch(name, projects) : null);
  if (name && !project && !create) {
    const again = parse(escapeProjectTokens(text, parsed.spans), ctx);
    const kept = again.ok ? again.draft : { ...draft, projectName: null, projectCreate: false };
    return { submission: { draft: kept, projectId: null, createProjectName: null }, title: kept.title, project: null, unfiled: { name, several: projectMatches(name, projects).length > 1 } };
  }
  return {
    submission: { draft: { ...draft, projectCreate: create }, projectId: project?.id ?? null, createProjectName: create ? name : null },
    title: draft.title,
    project: project?.name ?? (create ? name : null),
    unfiled: null,
  };
}

/** "Added “Email the accountant” to Q4 planning", or why a #name stayed in the title. */
function addedNotice(f: Filed): string {
  const added = `Added “${f.title}”${f.project ? ` to ${f.project}` : ""}`;
  if (!f.unfiled) return added;
  return `${added} — ${f.unfiled.several ? `#${f.unfiled.name} fits more than one project` : `no project is called “${f.unfiled.name}”`}, so it stays in the title`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const reason = (e: unknown) => (e instanceof Error && e.message ? e.message : "try again.");

// Tokens in the line are told apart by weight of colour alone: a project is
// the meet token, everything else steps back to ink-2 (D11: no green, no
// ember in the box). The chips below carry the meaning.
const TOKEN_TONE: Record<Span["kind"], string> = {
  protected: "",
  datetime: "text-ink-2",
  project: "text-meet",
  tag: "text-ink-2",
  estimate: "text-ink-2",
  priority: "text-ink-2",
  deadline: "text-ink-2",
  start: "text-ink-2",
  recurrence: "text-ink-2",
  evening: "text-ink-2",
  notes: "text-ink-3",
};

/** How each parsed fact is drawn: the chip family's tones and glyphs (DESIGN_SYSTEM.md §5 "Chips"). */
const FACT_CHIP: Record<Fact["kind"], { tone: ChipTone; icon: IconName | null }> = {
  time: { tone: "time", icon: "clock" },
  day: { tone: "time", icon: "calendar" },
  evening: { tone: "time", icon: "moon" },
  estimate: { tone: "neutral", icon: null },
  deadline: { tone: "deadline", icon: "flag" },
  start: { tone: "neutral", icon: "arrow-right" },
  repeat: { tone: "neutral", icon: "routines" },
  project: { tone: "meet", icon: null },
  tag: { tone: "neutral", icon: null },
  priority: { tone: "neutral", icon: null },
  note: { tone: "neutral", icon: null },
};

const SUGGESTIONS: { label: string; insert: string }[] = [
  { label: "today", insert: "today" },
  { label: "tmrw", insert: "tomorrow" },
  { label: "evening", insert: "evening" },
  { label: "~15m", insert: "~15m" },
  { label: "~30m", insert: "~30m" },
  { label: "~45m", insert: "~45m" },
  { label: "~1h", insert: "~1h" },
  { label: "#project", insert: "#" },
  { label: "@tag", insert: "@" },
  { label: "!1", insert: "!1" },
];

/** A suggestion or a project match: the chip that is a button (DESIGN_SYSTEM.md §5 "Chips"). */
const SUGGEST = chipButtonClass();

/** The line itself: the field look at 48 px and 16 px type on every width, so iOS never zooms. The border turns ink on focus, so no ring. */
const LINE = "h-12 w-full rounded-lg border border-line-control px-3.5 text-base outline-none placeholder:text-ink-4 focus:border-ink focus-visible:outline-none";

/** The long example runs past the end of the box at 412 px, so the phone gets the short invitation. */
const PLACEHOLDER = "Add a task — e.g. Draft proposal fri 3pm ~45m #acme !1";
const PLACEHOLDER_NARROW = "Add a task…";

/** True below `sm`, read once the sheet is up rather than guessed on the server. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 39.9375rem)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return narrow;
}

export function QuickAdd({
  open,
  initial = "",
  projects,
  ctx,
  onClose,
  onSubmit,
  onPasted,
  onDiscard,
}: {
  open: boolean;
  initial?: string;
  projects: readonly QuickAddProject[];
  ctx: QuickAddContext;
  onClose: () => void;
  onSubmit: QuickAddSave;
  /** A paste saved these tasks: returns how to take them all back, once (the caller also puts that on the undo stack). */
  onPasted?: (ids: readonly string[]) => (() => Promise<void>) | null | undefined;
  /** The sheet closed with words in the box: `text` as typed, `title` as the strip would save it (§5.1 rule 4). */
  onDiscard?: (text: string, title: string) => void;
}) {
  const [value, setValue] = useState(initial);
  // Keys typed while the sheet was still loading arrive as a longer `initial`; take them unless the box has moved on.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    if (initial.startsWith(value)) setValue(initial);
  }
  const [createProject, setCreateProject] = useState(false);
  /** What the last save did; a paste's carries the way to take it back ("4 tasks added · Undo"). */
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  /** Why the last save failed; the words stay in the box so nothing is lost. */
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const paintRef = useRef<HTMLDivElement>(null);
  const stripId = useId();
  const narrow = useNarrow();

  // Focus the input on open; hand focus back to whatever opened us on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const input = inputRef.current;
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
    return () => {
      opener?.focus?.();
    };
  }, [open]);

  const parseCtx = useMemo(() => ({ now: ctx.now, zone: ctx.zone, eveningStartsAt: ctx.eveningStartsAt }), [ctx.now, ctx.zone, ctx.eveningStartsAt]);
  const result = useMemo(() => parse(value, parseCtx), [value, parseCtx]);
  const draft = result.ok ? result.draft : null;
  const spans = result.ok ? result.spans : [];
  const warnings = result.ok ? result.warnings : [];

  const projectName = draft?.projectName ?? null;
  const exact = resolveProject(projectName, projects);
  const suggestions = projectName && !exact ? projectMatches(projectName, projects).slice(0, 3) : [];
  const willCreate = Boolean(projectName) && !exact && (createProject || Boolean(draft?.projectCreate));
  // A partial name that fits one project is filed there on save, so the strip says so now: it is the contract.
  const match = exact ?? (projectName && !willCreate ? bestProjectMatch(projectName, projects) : null);
  const projectLabel = match ? match.name : projectName ? (willCreate ? `new project ${projectName}` : `${projectName}?`) : null;
  const interpretation = draft ? interpret(draft, ctx.today, projectLabel) : null;
  /** Tokens and no words (`tomorrow ~30m`): the save is blocked and the strip asks for a name (§5.4). */
  const needsName = !result.ok && value.trim() !== "";

  const syncScroll = () => {
    if (paintRef.current && inputRef.current) paintRef.current.scrollLeft = inputRef.current.scrollLeft;
  };
  useEffect(syncScroll, [value]);

  const insert = (token: string) => {
    const base = value.trimEnd();
    const next = base ? `${base} ${token}` : token;
    setValue(next);
    const input = inputRef.current;
    if (input) {
      input.focus();
      requestAnimationFrame(() => input.setSelectionRange(next.length, next.length));
    }
  };

  const pickProject = (p: QuickAddProject) => {
    const span = spans.find((s) => s.kind === "project");
    if (!span) return;
    setValue(`${value.slice(0, span.start)}${projectToken(p.name)}${value.slice(span.end)}`);
    setCreateProject(false);
    inputRef.current?.focus();
  };

  // No manual memo: the compiler handles it, and its view of the dependencies is the right one.
  // Brain-dump mode (PRODUCT_SPEC.md §5.1 rule 4): Enter clears the box at once and the save runs behind it,
  // one after another in the order asked, so the next line can be typed while the last one is still saving.
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  const submit = (close: boolean) => {
    if (!result.ok || busy) return;
    const text = value;
    const filed = fileLine(text, result, projects, parseCtx, createProject);
    setValue("");
    setCreateProject(false);
    setError(null);
    saves.current = saves.current
      .then(() => onSubmit(filed.submission))
      .then(
        () => {
          setNotice({ text: addedNotice(filed) });
          if (close) onClose();
        },
        (e: unknown) => {
          setNotice(null);
          setError(`Couldn't save “${filed.title}”: ${reason(e)}`);
          // The words come back unless something new has been typed since.
          setValue((now) => (now.trim() === "" ? text : now));
        },
      );
  };

  // Closing with words in the box discards them, and offers them back once (§5.1 rule 4); an empty box just closes.
  const dismiss = () => {
    const text = value.trim();
    if (text) onDiscard?.(text, result.ok ? result.draft.title : text);
    onClose();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit(e.metaKey || e.ctrlKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      dismiss();
    } else if (e.key === "Tab" && projectName && !exact) {
      e.preventDefault();
      if (suggestions.length > 0) pickProject(suggestions[0]);
      else setCreateProject(true);
    }
  };

  // Many lines, many tasks (§5.1 rule 6): each parsed and filed on its own, saved in order after anything still
  // saving, then one notice with one Undo that takes back exactly what this paste added.
  const onPaste = async (e: ClipboardEvent<HTMLInputElement>) => {
    const lines = splitPaste(e.clipboardData.getData("text"));
    if (lines.length === 0) return;
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const ids: string[] = [];
    let added = 0;
    let unnamed = 0;
    try {
      await saves.current.catch(() => undefined);
      for (const [i, line] of lines.entries()) {
        const r = parse(line, parseCtx);
        if (!r.ok) {
          unnamed += 1;
          continue;
        }
        const filed = fileLine(line, r, projects, parseCtx, false);
        try {
          const id = await onSubmit(filed.submission);
          if (typeof id === "string") ids.push(id);
          added += 1;
        } catch (err) {
          const left = lines.length - i - 1;
          setValue((now) => (now.trim() === "" ? line : now));
          setError(`Couldn't save “${filed.title}”: ${reason(err)}${left > 0 ? ` ${plural(left, "line after it was", "lines after it were")} not saved either.` : ""}`);
          break;
        }
      }
    } finally {
      setBusy(false);
    }
    if (added === 0 && unnamed === 0) return;
    const skipped = unnamed > 0 ? ` · ${plural(unnamed, "line", "lines")} with no name skipped` : "";
    const takeBack = ids.length > 0 ? onPasted?.(ids) : null;
    setNotice({
      text: `${plural(added, "task", "tasks")} added${skipped}`,
      undo: takeBack
        ? () =>
            void takeBack().then(
              () => setNotice({ text: `Took back ${plural(ids.length, "task", "tasks")}` }),
              (err: unknown) => setError(`Couldn't take them back: ${reason(err)}`),
            )
        : undefined,
    });
  };

  if (!open) return null;

  return (
    <Sheet label="Add a task" onClose={dismiss} width="lg">
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {/* The phone sheet's way back (SCREENS.md §22 "← Quick add"): the keyboard hides the scrim and there is no Esc key. */}
        <div className="-mt-2 -ml-3 flex items-center gap-1 sm:hidden">
          <Button variant="icon" aria-label="Close" onClick={dismiss}>
            <Icon name="arrow-left" size={18} />
          </Button>
          <h2 className="text-body-lg font-medium text-ink">Quick add</h2>
        </div>
        <div className="relative">
          {/* The painted line sits under the box: the same metrics, the box's own border width added to the padding, so the glyphs land exactly under the caret. */}
          <div ref={paintRef} aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center overflow-hidden rounded-lg bg-surface px-[calc(0.875rem+1px)] text-base whitespace-pre text-ink">
            {segments(value, spans).map((s, i) =>
              s.kind ? (
                <mark key={i} data-kind={s.kind} className={cx("bg-transparent", TOKEN_TONE[s.kind])}>
                  {s.text}
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </div>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={(e) => void onPaste(e)}
            onScroll={syncScroll}
            aria-label="Task"
            aria-describedby={stripId}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            placeholder={narrow ? PLACEHOLDER_NARROW : PLACEHOLDER}
            className={cx(LINE, "relative bg-transparent text-transparent caret-ink")}
          />
        </div>

        {/* The parse restated as chips; the destination follows the arrow. A live region, so a screen reader hears the parse settle. */}
        <p id={stripId} aria-live="polite" className="flex min-h-[22px] flex-wrap items-center gap-1.5 text-body-sm text-ink-2">
          {interpretation && interpretation.facts.length > 0 ? (
            interpretation.facts.map((f, i) => <FactChip key={i} fact={f} first={i === 0} />)
          ) : needsName ? (
            <span className="text-ink-2">Give it a name</span>
          ) : (
            <span className="text-ink-3">Dates, times, ~estimates, #projects, @tags and !priority are understood.</span>
          )}
          {interpretation && (
            <span className="inline-flex items-center gap-1">
              <span className="sr-only"> → </span>
              <Icon name="arrow-right" size={14} className="text-ink-3" />
              {interpretation.destination}
            </span>
          )}
        </p>
        {warnings.length > 0 && (
          // A parse warning is a note, not a failure: ink-2 and the alert glyph (DESIGN_SYSTEM.md §2, ruling R1).
          <p className="flex items-start gap-1.5 text-body-sm text-pretty text-ink-2">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            {warnings.map((w) => WARNING_TEXT[w.code] ?? w.code).join(" · ")}
          </p>
        )}

        {projectName && !exact && (
          <div className="flex flex-wrap items-center gap-1.5">
            {suggestions.map((p) => (
              <button key={p.id} type="button" onClick={() => pickProject(p)} className={SUGGEST}>
                {p.name}
              </button>
            ))}
            <button type="button" onClick={() => setCreateProject(true)} aria-pressed={willCreate} className={SUGGEST}>
              <Icon name="plus" size={12} strokeWidth={2} className="shrink-0" />
              {willCreate ? "Will create" : "Create"} “{projectName}”
              {suggestions.length === 0 && !willCreate && <Kbd className="ml-1">Tab</Kbd>}
            </button>
          </div>
        )}

        <div role="group" aria-label="Suggestions" className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s.label} type="button" onClick={() => insert(s.insert)} className={SUGGEST}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="hidden items-center gap-4 text-body-sm text-ink-2 sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <Kbd>⏎</Kbd> save and keep going
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>⌘⏎</Kbd> save and close
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Kbd>esc</Kbd> discard
            </span>
          </p>
          <Button variant="primary" size="desktop" onClick={() => void submit(false)} disabled={!draft || busy} className="max-sm:h-12 max-sm:w-full max-sm:text-body-lg">
            Add
          </Button>
        </div>
        {notice && (
          <p role="status" className="flex items-center gap-1.5 text-body-sm text-pretty text-ink-2">
            <Icon name="check" size={14} className="shrink-0 text-ink-3" /> {notice.text}
            {notice.undo && (
              <Button variant="link" size="compact" className="-my-2 ml-1" onClick={notice.undo}>
                Undo
              </Button>
            )}
          </p>
        )}
        {error && (
          <p role="alert" className="flex items-center gap-1.5 text-body-sm text-deadline">
            <Icon name="alert" size={14} className="shrink-0" /> {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** One parsed fact as a chip. Facts after the first carry a hidden separator so the live region reads as the strip did. */
function FactChip({ fact, first }: { fact: Fact; first: boolean }) {
  const look = FACT_CHIP[fact.kind];
  // A project that is only a guess stays neutral until it resolves or the person asks to create it.
  const tone = fact.kind === "project" && fact.tentative ? "neutral" : look.tone;
  return (
    <>
      {!first && <span className="sr-only"> · </span>}
      <Chip tone={tone} icon={look.icon}>
        {fact.chip ?? fact.label}
      </Chip>
    </>
  );
}

const WARNING_TEXT: Record<string, string> = {
  deadline_before_do_date_swapped: "The deadline was before the do-date, so they were swapped.",
  deadline_moved_to_first_occurrence: "The deadline was before the first repeat, so it moved to that day.",
  do_date_moved_to_start_date: "“after” sets when it starts, so the day became the start date.",
};
