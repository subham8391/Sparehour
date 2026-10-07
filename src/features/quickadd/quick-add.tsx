"use client";
// Quick-add (SCREENS.md §11): one line in, a task out. Tokens are painted in
// place as they complete, the strip below restates the parse as chips, ⏎
// saves and keeps going, ⌘⏎ saves and closes, esc discards (with a one-step
// undo). On a phone it is a bottom sheet docked above the keyboard, headed by
// "← Quick add"; from the narrow band up, a dialog under the top edge
// (DESIGN_SYSTEM.md §5 "Sheet"). Presentational and testable: data arrives as
// props.
import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from "react";
import { parse, type ParseContext, type ParseResult, type Range, type Span, type TaskDraft } from "@/core/quickadd";
import type { Instant, LocalDate, LocalTime } from "@/core/time";
import { Button } from "@/ui/button";
import { chipButtonClass, chipClass, type ChipTone } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon, type IconName } from "@/ui/icons";
import { Kbd } from "@/ui/kbd";
import { Sheet } from "@/ui/sheet";
import {
  bestProjectMatch,
  carryRanges,
  factSpans,
  interpret,
  projectMatches,
  projectOptionLabel,
  projectsNamed,
  projectToken,
  resolveTag,
  segments,
  splitPaste,
  tagMatches,
  tagToken,
  tokenName,
  type Fact,
  type QuickAddProject,
  type QuickAddTag,
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

/** What a typed `#name` files into, worked out the same way for the strip and the save. */
interface ProjectChoice {
  /** The project the task is filed in: named exactly, picked from the suggestions, or the one a partial name fits. */
  project: QuickAddProject | null;
  /** A new project of this name is made on save. */
  create: boolean;
  /** Two or more projects carry exactly this name (in different areas): none is guessed and none is created (§5.4). */
  collision: QuickAddProject[];
}

/**
 * Where a parsed line goes (PRODUCT_SPEC.md §5.2 "#name"): the project picked from the suggestions while its name
 * still reads the same; else the one project named exactly; else the one a partial name fits ("#Q4" → Q4
 * planning); else a new one when asked for. A name two projects share files nowhere until one is picked.
 */
function chooseProject(draft: TaskDraft, projects: readonly QuickAddProject[], picked: QuickAddProject | null, createAsked: boolean): ProjectChoice {
  const name = draft.projectName;
  if (!name) return { project: null, create: false, collision: [] };
  if (picked && projectsNamed(name, [picked]).length === 1) return { project: picked, create: false, collision: [] };
  const named = projectsNamed(name, projects);
  if (named.length === 1) return { project: named[0], create: false, collision: [] };
  if (named.length > 1) return { project: null, create: false, collision: named };
  const create = createAsked || draft.projectCreate;
  return { project: create ? null : bestProjectMatch(name, projects), create, collision: [] };
}

/**
 * A line made ready to save. A `#name` that files nothing keeps its words in the title rather than vanish (§5.3
 * rule 7): the line is read again with that token as literal text.
 */
function fileLine(text: string, parsed: Parsed, projects: readonly QuickAddProject[], ctx: ParseContext, choice: ProjectChoice, literal: readonly Range[] = []): Filed {
  const { draft } = parsed;
  const name = draft.projectName;
  const { project, create } = choice;
  if (name && !project && !create) {
    const again = parse(text, ctx, { literal: [...literal, ...parsed.spans.filter((s) => s.kind === "project")] });
    const kept = again.ok ? again.draft : { ...draft, projectName: null, projectCreate: false };
    const several = choice.collision.length > 1 || projectMatches(name, projects).length > 1;
    return { submission: { draft: kept, projectId: null, createProjectName: null }, title: kept.title, project: null, unfiled: { name, several } };
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
  literal: "",
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

/** The spans a Backspace right after them, or a chip's remove control, can turn back into words. */
const UNPARSEABLE: ReadonlySet<Span["kind"]> = new Set(["datetime", "evening", "estimate", "priority", "project", "tag", "deadline", "start", "recurrence"]);

export interface QuickAddProps {
  open: boolean;
  initial?: string;
  projects: readonly QuickAddProject[];
  /** Every tag in the space, for the `@` suggestions; a typed name none matches is created on save. */
  tags?: readonly QuickAddTag[];
  ctx: QuickAddContext;
  onClose: () => void;
  onSubmit: QuickAddSave;
  onPasted?: (ids: readonly string[]) => (() => Promise<void>) | null | undefined;
  onDiscard?: (text: string, title: string) => void;
  /** The first run's brain dump: the same composer in the page, not a sheet (ONBOARDING.md step 3). */
  inline?: boolean;
  placeholder?: string;
  /** Said under the box until the line has something to restate. */
  hint?: ReactNode;
  /** How the line will be saved when the caller files it its own way (the brain dump puts it on today). */
  shape?: (draft: TaskDraft) => TaskDraft;
}

export function QuickAdd({
  open,
  initial = "",
  projects,
  tags = [],
  ctx,
  onClose,
  onSubmit,
  onPasted,
  onDiscard,
  inline = false,
  placeholder,
  hint,
  shape,
}: {
  open: boolean;
  initial?: string;
  projects: readonly QuickAddProject[];
  tags?: readonly QuickAddTag[];
  ctx: QuickAddContext;
  onClose: () => void;
  onSubmit: QuickAddSave;
  /** A paste saved these tasks: returns how to take them all back, once (the caller also puts that on the undo stack). */
  onPasted?: (ids: readonly string[]) => (() => Promise<void>) | null | undefined;
  /** The sheet closed with words in the box: `text` as typed, `title` as the strip would save it (§5.1 rule 4). */
  onDiscard?: (text: string, title: string) => void;
  inline?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  shape?: (draft: TaskDraft) => TaskDraft;
}) {
  // The line, and the runs of it the person turned back into words (a removed chip): those stay literal title
  // text while typing goes on (PRODUCT_SPEC.md §5.1 rule 3).
  const [line, setLine] = useState<{ text: string; literal: Range[] }>({ text: initial, literal: [] });
  const value = line.text;
  const setValue = (next: string) => setLine((l) => ({ text: next, literal: carryRanges(l.literal, l.text, next) }));
  // Keys typed while the sheet was still loading arrive as a longer `initial`; take them unless the box has moved on.
  const [seenInitial, setSeenInitial] = useState(initial);
  if (initial !== seenInitial) {
    setSeenInitial(initial);
    if (initial.startsWith(value)) setLine({ text: initial, literal: line.literal });
  }
  const [createProject, setCreateProject] = useState(false);
  /** The project picked from the suggestions: two of one name read the same in the line, so the pick is kept here. */
  const [picked, setPicked] = useState<QuickAddProject | null>(null);
  /** Where the caret is, to tell which `@tag` is being typed. */
  const [caret, setCaret] = useState<number | null>(null);
  /** A run of Backspaces: only the first one next to a token un-parses it, the rest delete as usual. */
  const backspacing = useRef(false);
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
  const result = useMemo(() => parse(value, parseCtx, { literal: line.literal }), [value, parseCtx, line.literal]);
  const draft = result.ok ? result.draft : null;
  const spans = result.ok ? result.spans : [];
  const warnings = result.ok ? result.warnings : [];

  const projectName = draft?.projectName ?? null;
  const choice: ProjectChoice = draft ? chooseProject(draft, projects, picked, createProject) : { project: null, create: false, collision: [] };
  // Named exactly (or picked): nothing to suggest. Two of that name: those two, told apart by area, and no Create (§5.4).
  const exact = choice.project && projectName && projectsNamed(projectName, [choice.project]).length === 1 ? choice.project : null;
  const collision = choice.collision.length > 1;
  const suggestions = projectName && !exact ? (collision ? choice.collision : projectMatches(projectName, projects).slice(0, 3)) : [];
  const willCreate = choice.create;
  // A partial name that fits one project is filed there on save, so the strip says so now: it is the contract.
  const match = choice.project;
  const projectLabel = match ? projectOptionLabel(match, projects) : projectName ? (willCreate ? `new project ${projectName}` : `${collision ? choice.collision[0].name : projectName}?`) : null;

  // The `@tag` the caret is in: its matches as chips, and "Create @name" when no tag is called that (SCREENS.md §11).
  const tagSpan = caret == null ? undefined : spans.find((s) => s.kind === "tag" && s.start < caret && caret <= s.end);
  const tagName = tagSpan ? tokenName(tagSpan) : "";
  const tagKnown = tagSpan ? resolveTag(tagName, tags) : null;
  const tagSuggestions = tagSpan && !tagKnown ? tagMatches(tagName, tags).slice(0, 3) : [];
  const newTags = draft ? draft.tagNames.filter((t) => !resolveTag(t, tags)) : [];
  const interpretation = draft ? interpret(shape ? shape(draft) : draft, ctx.today, projectLabel, newTags) : null;
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

  /** Puts `token` in place of `span` with a space after it, and the caret after that space: the token is finished. */
  const replaceSpan = (span: Span, token: string) => {
    const rest = value.slice(span.end);
    const glue = rest.startsWith(" ") ? "" : " ";
    const next = `${value.slice(0, span.start)}${token}${glue}${rest}`;
    const at = span.start + token.length + 1;
    setValue(next);
    setCaret(at);
    const input = inputRef.current;
    if (input) {
      input.focus();
      requestAnimationFrame(() => input.setSelectionRange(at, at));
    }
  };

  const pickProject = (p: QuickAddProject) => {
    const span = spans.findLast((s) => s.kind === "project");
    if (!span) return;
    setValue(`${value.slice(0, span.start)}${projectToken(p.name)}${value.slice(span.end)}`);
    setPicked(p);
    setCreateProject(false);
    inputRef.current?.focus();
  };

  const pickTag = (t: QuickAddTag) => tagSpan && replaceSpan(tagSpan, tagToken(t.name));
  // A new tag needs nothing more than its name (it is made on save); accepting it just finishes the token.
  const acceptNewTag = () => tagSpan && replaceSpan(tagSpan, tagSpan.text);

  // Turns tokens back into the words they were typed as (PRODUCT_SPEC.md §5.1 rule 3): they stay in the title.
  const unparse = (gone: readonly Span[]) => {
    if (gone.length === 0) return;
    setLine((l) => ({ text: l.text, literal: [...l.literal, ...gone.map((s) => ({ start: s.start, end: s.end }))] }));
    if (gone.some((s) => s.kind === "project")) setPicked(null);
  };

  // No manual memo: the compiler handles it, and its view of the dependencies is the right one.
  // Brain-dump mode (PRODUCT_SPEC.md §5.1 rule 4): Enter clears the box at once and the save runs behind it,
  // one after another in the order asked, so the next line can be typed while the last one is still saving.
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  const submit = (close: boolean) => {
    if (!result.ok || busy) return;
    const text = value;
    const literal = line.literal;
    const filed = fileLine(text, result, projects, parseCtx, choice, literal);
    setLine({ text: "", literal: [] });
    setCreateProject(false);
    setPicked(null);
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
          setLine((now) => (now.text.trim() === "" ? { text, literal } : now));
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
    const wasBackspacing = backspacing.current;
    backspacing.current = e.key === "Backspace";
    if (e.key === "Enter") {
      e.preventDefault();
      void submit(e.metaKey || e.ctrlKey);
    } else if (e.key === "Escape" && !inline) {
      e.preventDefault();
      dismiss();
    } else if (e.key === "Backspace" && !wasBackspacing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Right after a token, the first Backspace turns it back into words; the next one deletes as usual (§5.1 rule 3).
      const { selectionStart: at, selectionEnd } = e.currentTarget;
      const token = at != null && at === selectionEnd ? spans.find((s) => s.end === at && UNPARSEABLE.has(s.kind)) : undefined;
      if (token) {
        e.preventDefault();
        unparse([token]);
      }
    } else if (e.key === "Tab" && !e.shiftKey && tagSpan && !tagKnown) {
      e.preventDefault();
      if (tagSuggestions.length > 0) pickTag(tagSuggestions[0]);
      else acceptNewTag();
    } else if (e.key === "Tab" && !e.shiftKey && projectName && !exact && !willCreate) {
      // Once the name is taken (picked, or Create accepted) Tab moves on as usual, so the key never traps focus here.
      e.preventDefault();
      if (suggestions.length > 0) pickProject(suggestions[0]);
      else if (!collision) setCreateProject(true);
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
      for (const [i, pasted] of lines.entries()) {
        const r = parse(pasted, parseCtx);
        if (!r.ok) {
          unnamed += 1;
          continue;
        }
        const filed = fileLine(pasted, r, projects, parseCtx, chooseProject(r.draft, projects, null, false));
        try {
          const id = await onSubmit(filed.submission);
          if (typeof id === "string") ids.push(id);
          added += 1;
        } catch (err) {
          const left = lines.length - i - 1;
          setLine((now) => (now.text.trim() === "" ? { text: pasted, literal: [] } : now));
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
    <Frame inline={inline} onClose={dismiss}>
      <div className={cx("flex flex-col gap-3", !inline && "p-4 sm:p-5")}>
        {/* The phone sheet's way back (SCREENS.md §22 "← Quick add"): the keyboard hides the scrim and there is no Esc key. */}
        {!inline && (
          <div className="-mt-2 -ml-3 flex items-center gap-1 sm:hidden">
            <Button variant="icon" aria-label="Close" onClick={dismiss}>
              <Icon name="arrow-left" size={18} />
            </Button>
            <h2 className="text-body-lg font-medium text-ink">Quick add</h2>
          </div>
        )}
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
            onChange={(e) => {
              setValue(e.target.value);
              setCaret(e.target.selectionStart);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            onPaste={(e) => void onPaste(e)}
            onScroll={syncScroll}
            aria-label="Task"
            aria-describedby={stripId}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint={inline ? "enter" : "done"}
            placeholder={placeholder ?? (narrow ? PLACEHOLDER_NARROW : PLACEHOLDER)}
            className={cx(LINE, "relative bg-transparent text-transparent caret-ink")}
          />
        </div>

        {/* The parse restated as chips; the destination follows the arrow. A live region, so a screen reader hears the parse settle. */}
        <p id={stripId} aria-live="polite" className="flex min-h-[22px] flex-wrap items-center gap-1.5 text-body-sm text-ink-2">
          {interpretation && interpretation.facts.length > 0 ? (
            interpretation.facts.map((f, i) => {
              const from = factSpans(f, spans).filter((s) => UNPARSEABLE.has(s.kind) || s.kind === "notes");
              return <FactChip key={i} fact={f} first={i === 0} onRemove={from.length > 0 ? () => (unparse(from), inputRef.current?.focus()) : undefined} />;
            })
          ) : needsName ? (
            <span className="text-ink-2">Give it a name</span>
          ) : (
            <span className="text-ink-3">{hint ?? "Dates, times, ~estimates, #projects, @tags and !priority are understood."}</span>
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

        {tagSpan && !tagKnown ? (
          // The tag being typed: its matches first, then (or alone, when none) "Create @name" (SCREENS.md §11).
          <div role="group" aria-label="Tags" className="flex flex-wrap items-center gap-1.5">
            {tagSuggestions.map((t) => (
              <button key={t.id} type="button" onClick={() => pickTag(t)} className={SUGGEST}>
                @{t.name}
              </button>
            ))}
            <button type="button" onClick={acceptNewTag} className={SUGGEST}>
              <Icon name="plus" size={12} strokeWidth={2} className="shrink-0" />
              Create @{tagName}
              {tagSuggestions.length === 0 && <Kbd className="ml-1">Tab</Kbd>}
            </button>
          </div>
        ) : (
          projectName &&
          !exact && (
            // Two projects of one name are told apart by their area, and neither is created again (§5.4).
            <div role="group" aria-label="Projects" className="flex flex-wrap items-center gap-1.5">
              {suggestions.map((p) => (
                <button key={p.id} type="button" onClick={() => pickProject(p)} className={SUGGEST}>
                  {projectOptionLabel(p, projects)}
                </button>
              ))}
              {!collision && (
                <button type="button" onClick={() => setCreateProject(true)} aria-pressed={willCreate} className={SUGGEST}>
                  <Icon name="plus" size={12} strokeWidth={2} className="shrink-0" />
                  {willCreate ? "Will create" : "Create"} “{projectName}”
                  {suggestions.length === 0 && !willCreate && <Kbd className="ml-1">Tab</Kbd>}
                </button>
              )}
            </div>
          )
        )}

        {!inline && (
          <div role="group" aria-label="Suggestions" className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s.label} type="button" onClick={() => insert(s.insert)} className={SUGGEST}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className={cx("flex items-center gap-3", inline ? "justify-end" : "justify-between")}>
          <p className={cx("hidden items-center gap-4 text-body-sm text-ink-2", !inline && "sm:flex")}>
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
          {/* In the page the step's own button is the primary; Add stays as the tap path for a keyboard without Enter. */}
          <Button
            variant={inline ? "secondary" : "primary"}
            size={inline ? "auto" : "desktop"}
            onClick={() => void submit(false)}
            disabled={!draft || busy}
            className={inline ? undefined : "max-sm:h-12 max-sm:w-full max-sm:text-body-lg"}
          >
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
    </Frame>
  );
}

/** The composer's frame: the sheet, or nothing of its own when a page holds it (the brain dump). */
function Frame({ inline, onClose, children }: { inline: boolean; onClose: () => void; children: ReactNode }) {
  if (inline) return children;
  return (
    <Sheet label="Add a task" onClose={onClose} width="lg">
      {children}
    </Sheet>
  );
}

/**
 * One parsed fact as a chip, with a remove control that turns its tokens back into title words (PRODUCT_SPEC.md
 * §5.1 rule 3): a 44 px target on touch that leaves the chip its own size. Facts after the first carry a hidden
 * separator so the live region reads as the strip did.
 */
function FactChip({ fact, first, onRemove }: { fact: Fact; first: boolean; onRemove?: () => void }) {
  const look = FACT_CHIP[fact.kind];
  // A project that is only a guess stays neutral until it resolves or the person asks to create it.
  const tone = fact.kind === "project" && fact.tentative ? "neutral" : look.tone;
  const text = fact.chip ?? fact.label;
  return (
    <>
      {!first && <span className="sr-only"> · </span>}
      {/* Capped at the strip's width, so a long repeat plus its remove target never pushes a 360 px sheet sideways. */}
      <span className={cx(chipClass({ tone }), "max-w-full", onRemove && "pr-0")}>
        {look.icon && <Icon name={look.icon} size={12} className="shrink-0" />}
        <span className="min-w-0 truncate">{text}</span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove “${text}”`}
            title="Keep these words in the title"
            className="-my-3 flex size-11 shrink-0 items-center justify-center rounded-sm opacity-70 transition-opacity dur-fast hover:opacity-100 sm:my-0 sm:size-5.5"
          >
            <Icon name="close" size={10} strokeWidth={2} />
          </button>
        )}
      </span>
    </>
  );
}

const WARNING_TEXT: Record<string, string> = {
  deadline_before_do_date: "Due before you plan to do it.",
  deadline_moved_to_first_occurrence: "The deadline was before the first repeat, so it moved to that day.",
  do_date_moved_to_start_date: "“after” sets when it starts, so the day became the start date.",
};
