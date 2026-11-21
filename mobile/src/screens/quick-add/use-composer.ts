// The quick-add line and what is understood of it (SCREENS.md §11), with no screen: the words in the box, the runs of
// them turned back into words, the project picked, where the sheet was opened, what the last save did. Every
// reading and every decision is the web's own function: the parser, `chooseProject`, `fileLine` and `fileHere`,
// `interpret`, the project and tag matches, the estimate token, the notice's words. Only the order they are called
// in is written here, because on the web that order lives inside its sheet (../../../../src/features/quickadd/
// quick-add.tsx); the two must be kept in step by hand until it moves to a file both can read.
//
// A phone's box differs from a browser's in one way that matters here: it reports its new words and nothing else. There
// is no paste event and no key to refuse, so a pasted list and the Backspace after a token are read from the change
// itself (line-edit.ts), and a change the line does not take is put right in the box afterwards: `holds` is what the
// box was left holding, drawn once so that the drawing after it writes the line back (token-line.tsx says why).
import { useEffect, useMemo, useRef, useState } from "react";
import { estimateToken } from "@/core/estimates";
import { parse, type Range, type Span, type TaskDraft } from "@/core/quickadd";
import { compareDates, localDate, type Instant, type LocalDate, type LocalTime } from "@/core/time";
import { addedNotice, chooseProject, draftHere, fileHere, fileLine, type Here, type ProjectChoice, type QuickAddSubmission } from "@/features/quickadd/file-line";
import { carryRanges, factSpans, interpret, projectMatches, projectOptionLabel, projectsNamed, projectToken, resolveTag, segments, tagMatches, tagToken, tokenName, type FactKind, type QuickAddProject, type QuickAddTag } from "@/features/quickadd/interpret";
import { couldNotTakeBack, pastedNotice, savePasted, tookBack, type Pasted } from "@/features/quickadd/paste";
import { UNPARSEABLE, WARNING_TEXT, couldNotSave } from "@/features/quickadd/quick-add-words";
import { caretAfter, lineEdit, linesPasted, onOneLine, tokenBackspaced } from "./line-edit";

export interface QuickAddContext {
  now: Instant;
  zone: string;
  today: LocalDate;
  eveningStartsAt?: LocalTime;
}

/**
 * Where a line that does not say goes, when the sheet was opened from a day, a project's page or an area's
 * (DECISIONS.md, amendment 2026-11-15). Nothing is typed into the box for it; the strip shows it as a chip.
 */
export interface QuickAddHere {
  day?: LocalDate | null;
  projectId?: string | null;
  /** An area's own page: a line with no project is filed in the area directly (the area view's add row). */
  area?: { id: string; name: string } | null;
}

/** What the page still gives a saved line, beyond its day: whether it went into the page's own project, and the area it is filed in. */
export interface SavedHere {
  pageProject: boolean;
  areaId: string | null;
}

/** A save, resolved once the task is written. */
export type QuickAddSave = (submission: QuickAddSubmission, here: SavedHere) => Promise<string | void>;

/** One chip of the strip: a fact the line states, or the day, project or area the sheet was opened on. */
export interface StripChip {
  kind: FactKind | "area";
  text: string;
  /** A project that is named but neither found nor promised yet. */
  tentative: boolean;
  /** It came with the page, not from words in the line: its × takes it off rather than give words back. */
  here: boolean;
  onRemove?: () => void;
}

export interface ComposerInput {
  initial?: string;
  projects: readonly QuickAddProject[];
  tags?: readonly QuickAddTag[];
  ctx: QuickAddContext;
  here?: QuickAddHere | null;
  usual?: (task: { estimateMin: number | null; projectId: string | null }) => number | null;
  onSubmit: QuickAddSave;
  /** A paste saved these tasks: returns how to take them all back, once (the caller also puts that on the undo stack). */
  onPasted?: (ids: readonly string[]) => (() => Promise<void>) | null | undefined;
  onClose: () => void;
  onDiscard?: (text: string, title: string) => void;
}

/** The last span of a kind: the one that counts when a token is typed twice (PRODUCT_SPEC.md §5.3 rule 2). */
const lastOf = (spans: readonly Span[], kind: Span["kind"]): Span | undefined => spans.filter((s) => s.kind === kind).pop();

export function useComposer({ initial = "", projects, tags = [], ctx, here = null, usual, onSubmit, onPasted, onClose, onDiscard }: ComposerInput) {
  // The line, and the runs of it the person turned back into words (a removed chip): those stay literal title text
  // while typing goes on (PRODUCT_SPEC.md §5.1 rule 3).
  const [line, setLine] = useState<{ text: string; literal: Range[] }>({ text: initial, literal: [] });
  const value = line.text;
  const setValue = (next: string) => setLine((l) => ({ text: next, literal: carryRanges(l.literal, l.text, next) }));
  const [createProject, setCreateProject] = useState(false);
  /** The project picked from the suggestions: two of one name read the same in the line, so the pick is kept here. */
  const [picked, setPicked] = useState<QuickAddProject | null>(null);
  /** Where the caret is, to tell which `@tag` is being typed. */
  const [caret, setCaret] = useState<number | null>(initial.length);
  /** Where the caret is put after the line was changed by a tap, until the box reports it there. */
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  /** What the last save did; a paste's carries the way to take it back ("4 tasks added" and Undo). */
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  /** Why the last save failed; the words stay in the box so nothing is lost. */
  const [error, setError] = useState<string | null>(null);
  /** A pasted list is being saved: nothing else is sent until it is. */
  const [busy, setBusy] = useState(false);
  /** What the box holds when that is not the line (a change the line did not take): drawn once, then the line again. */
  const [holds, setHolds] = useState<string | null>(null);
  useEffect(() => {
    if (holds !== null) setHolds(null);
  }, [holds]);
  /** The words the box held when a change was last refused, until a change is taken again. */
  const refused = useRef<string | null>(null);
  /** The last key and the one before it: only the first Backspace of a run turns a token back into words. */
  const backspace = useRef({ was: false, now: false });

  // Where a line that does not say goes. A day that has passed takes new tasks on today. Each can be taken off for
  // this opening of the sheet.
  const [hereOff, setHereOff] = useState<{ day?: boolean; project?: boolean; area?: boolean }>({});
  const hereIso = here?.day && !hereOff.day ? here.day.toString() : null;
  const hereProjectId = here?.projectId && !hereOff.project ? here.projectId : null;
  const hereArea = here?.area && !hereOff.area ? here.area : null;
  const hereDay = useMemo(() => {
    const day = hereIso ? localDate(hereIso) : null;
    return day && compareDates(day, ctx.today) < 0 ? ctx.today : day;
  }, [hereIso, ctx.today]);
  // The parser is told the day too: a time, `evening` or a repeat typed without a date is for that day.
  const parseCtx = useMemo(() => ({ now: ctx.now, zone: ctx.zone, today: ctx.today, eveningStartsAt: ctx.eveningStartsAt, ...(hereDay ? { from: hereDay } : {}) }), [ctx.now, ctx.zone, ctx.today, ctx.eveningStartsAt, hereDay]);
  const result = useMemo(() => parse(value, parseCtx, { literal: line.literal }), [value, parseCtx, line.literal]);
  const draft = result.ok ? result.draft : null;
  const spans: readonly Span[] = result.ok ? result.spans : [];
  const warnings = result.ok ? result.warnings.map((w) => WARNING_TEXT[w.code] ?? w.code) : [];

  const place = useMemo<Here>(() => ({ day: hereDay, project: hereProjectId ? (projects.find((p) => p.id === hereProjectId) ?? null) : null }), [hereDay, hereProjectId, projects]);
  /** Tokens and no words (`tomorrow ~30m`): the save is blocked and the strip asks for a name (§5.4). */
  const needsName = !result.ok && value.trim() !== "";
  // With nothing typed yet the strip already says where a task added here will go: an untitled draft stands in.
  const blank = useMemo(() => {
    const r = parse("x", parseCtx);
    return r.ok ? r.draft : null;
  }, [parseCtx]);
  const shown = draft ?? (!needsName && (place.day || place.project || hereArea) ? blank : null);

  const projectName = draft?.projectName ?? null;
  const choice: ProjectChoice = draft ? chooseProject(draft, projects, picked, createProject) : { project: null, create: false, collision: [] };
  // Named exactly (or picked): nothing to suggest. Two of that name: those two, told apart by area, and no Create (§5.4).
  const exact = choice.project && projectName && projectsNamed(projectName, [choice.project]).length === 1 ? choice.project : null;
  const collision = choice.collision.length > 1;
  const suggestions = projectName && !exact ? (collision ? choice.collision : projectMatches(projectName, projects).slice(0, 3)) : [];
  const willCreate = choice.create;
  // A partial name that fits one project is filed there on save, so the strip says so now: it is the contract.
  const match = choice.project ?? (projectName ? null : place.project);
  const dayIsHere = Boolean(place.day && shown && !shown.doDate);
  const projectIsHere = Boolean(place.project && !projectName);
  /** The area's page files the line only while no project does. */
  const area = hereArea && !match && !projectName ? hereArea : null;
  const projectLabel = match ? projectOptionLabel(match, projects) : projectName ? (willCreate ? `new project ${projectName}` : `${collision ? choice.collision[0].name : projectName}?`) : null;

  // The `@tag` the caret is in: its matches as chips, and "Create @name" when no tag is called that (SCREENS.md §11).
  const tagSpan = caret == null ? undefined : spans.find((s) => s.kind === "tag" && s.start < caret && caret <= s.end);
  const tagName = tagSpan ? tokenName(tagSpan) : "";
  const tagKnown = tagSpan ? resolveTag(tagName, tags) : null;
  const tagSuggestions = tagSpan && !tagKnown ? tagMatches(tagName, tags).slice(0, 3) : [];
  const newTags = draft ? draft.tagNames.filter((t) => !resolveTag(t, tags)) : [];
  /** The draft as the strip and the day line read it: placed here. */
  const asSaved = (d: TaskDraft) => draftHere(d, place);
  const interpretation = shown ? interpret(asSaved(shown), ctx.today, projectLabel, newTags) : null;
  // What finished tasks say this one will take, when that is not what the line counts it as (DECISIONS.md, amendment 2026-11-15).
  const usualMin = draft && usual ? usual({ estimateMin: draft.estimateMin, projectId: match?.id ?? null }) : null;

  /** The line changed by a tap: the new words, and the caret left at `at`. */
  const write = (next: string, at: number) => {
    refused.current = null;
    setValue(next);
    setCaret(at);
    setSelection({ start: at, end: at });
  };

  const insert = (token: string) => {
    const base = value.trimEnd();
    const next = base ? `${base} ${token}` : token;
    write(next, next.length);
  };

  /** Puts `token` in place of `span` with a space after it, and the caret after that space: the token is finished. */
  const replaceSpan = (span: Span, token: string) => {
    const rest = value.slice(span.end);
    const glue = rest.startsWith(" ") ? "" : " ";
    write(`${value.slice(0, span.start)}${token}${glue}${rest}`, span.start + token.length + 1);
  };

  const takeUsual = () => {
    if (usualMin == null) return;
    const typed = lastOf(spans, "estimate");
    if (typed) replaceSpan(typed, estimateToken(usualMin));
    else insert(estimateToken(usualMin));
  };

  const pickProject = (p: QuickAddProject) => {
    const span = lastOf(spans, "project");
    if (!span) return;
    const token = projectToken(p.name);
    write(`${value.slice(0, span.start)}${token}${value.slice(span.end)}`, span.start + token.length);
    setPicked(p);
    setCreateProject(false);
  };

  // Turns tokens back into the words they were typed as (PRODUCT_SPEC.md §5.1 rule 3): they stay in the title.
  const unparse = (gone: readonly Span[]) => {
    if (gone.length === 0) return;
    setLine((l) => ({ text: l.text, literal: [...l.literal, ...gone.map((s) => ({ start: s.start, end: s.end }))] }));
    if (gone.some((s) => s.kind === "project")) setPicked(null);
  };

  const chips: StripChip[] = (interpretation?.facts ?? []).map((f) => {
    const from = factSpans(f, spans).filter((s) => UNPARSEABLE.has(s.kind) || s.kind === "notes");
    // A day or a project that came with the page has no words to give back: its chip takes it off.
    const off = f.kind === "day" && dayIsHere ? "day" : f.kind === "project" && projectIsHere ? "project" : null;
    const onRemove = from.length > 0 ? () => unparse(from) : off ? () => setHereOff((o) => ({ ...o, [off]: true })) : undefined;
    return { kind: f.kind, text: f.chip ?? f.label, tentative: f.kind === "project" && Boolean(f.tentative), here: Boolean(off), onRemove };
  });
  if (area && interpretation) chips.push({ kind: "area", text: area.name, tentative: false, here: true, onRemove: () => setHereOff((o) => ({ ...o, area: true })) });
  // A line with no day goes to the area's own list, where the web's strip would say the Inbox.
  const destination = interpretation ? (area && interpretation.destination === "Inbox" ? area.name : interpretation.destination) : null;

  /** What the page still gives a line once it is filed: its own project's heading, or the area it is filed in. */
  const savedHere = (s: QuickAddSubmission): SavedHere => ({
    pageProject: Boolean(place.project && s.projectId === place.project.id),
    areaId: hereArea && !s.projectId && !s.createProjectName ? hereArea.id : null,
  });

  // Brain-dump mode (PRODUCT_SPEC.md §5.1 rule 4): Done clears the box at once and the save runs behind it, one after
  // another in the order asked, so the next line can be typed while the last one is still saving.
  const saves = useRef<Promise<unknown>>(Promise.resolve());
  /** Resolves true once this line is saved, false when it could not be (its words are back in the box). */
  const submit = (): Promise<boolean> => {
    if (!result.ok || busy) return Promise.resolve(false);
    const text = value;
    const literal = line.literal;
    const filed = fileHere(fileLine(text, result, projects, parseCtx, choice, literal), Boolean(result.draft.projectName), place);
    const at = savedHere(filed.submission);
    const saved = at.areaId && hereArea ? { ...filed, project: hereArea.name } : filed;
    refused.current = null;
    setLine({ text: "", literal: [] });
    setCaret(0);
    setSelection(undefined);
    setCreateProject(false);
    setPicked(null);
    setError(null);
    const done = saves.current
      .then(() => onSubmit(filed.submission, at))
      .then(
        () => {
          setNotice({ text: addedNotice(saved) });
          return true;
        },
        (e: unknown) => {
          setNotice(null);
          setError(couldNotSave(filed.title, e));
          // The words come back unless something new has been typed since.
          setLine((now) => (now.text.trim() === "" ? { text, literal } : now));
          return false;
        },
      );
    saves.current = done;
    return done;
  };

  // Many lines, many tasks (§5.1 rule 6): each parsed and filed on its own (features/quickadd/paste.ts), saved in order
  // after anything still saving, then one notice with one Undo that takes back exactly what this paste added.
  const paste = async (lines: readonly string[]) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    let pasted: Pasted;
    try {
      await saves.current.catch(() => undefined);
      pasted = await savePasted(lines, parseCtx, projects, place, (s) => onSubmit(s, savedHere(s)));
      if (pasted.stopped) {
        const { line: stoppedAt, error: why } = pasted.stopped;
        setLine((now) => (now.text.trim() === "" ? { text: stoppedAt, literal: [] } : now));
        setError(why);
      }
    } finally {
      setBusy(false);
    }
    const text = pastedNotice(pasted);
    if (!text) return;
    const { ids } = pasted;
    const takeBack = ids.length > 0 ? onPasted?.(ids) : null;
    setNotice({
      text,
      undo: takeBack
        ? () =>
            void takeBack().then(
              () => setNotice({ text: tookBack(ids.length) }),
              (err: unknown) => setError(couldNotTakeBack(err)),
            )
        : undefined,
    });
  };

  /** The box changed and the line did not: the box is written back to the line, the caret where it was. */
  const refuse = (boxHolds: string) => {
    refused.current = boxHolds;
    setHolds(boxHolds);
    if (caret != null) setSelection({ start: caret, end: caret });
  };

  const onChangeText = (next: string) => {
    // Right after a token, the first Backspace turns it back into words; the next one deletes as usual (§5.1 rule 3).
    const token = backspace.current.now && !backspace.current.was ? tokenBackspaced(value, next, caret, spans) : null;
    if (token) {
      unparse([token]);
      refuse(next);
      return;
    }
    const lines = linesPasted(value, next);
    // Had the box kept a list it was not meant to (the write-back above did not reach it), typing on would bring the
    // same lines in again: a change that adds no line of its own to what was refused is typing, never a second paste.
    const typedOverRefused = refused.current !== null && next !== refused.current && !/[\r\n]/.test(lineEdit(refused.current, next).inserted);
    if (lines.length > 0 && !typedOverRefused && !busy) {
      refuse(next);
      void paste(lines);
      return;
    }
    refused.current = null;
    // Line breaks that are not a list (one line and a blank one) come in as one line; the box is told so.
    const taken = onOneLine(next);
    setCaret(caretAfter(value, taken));
    setSelection(taken === next ? undefined : { start: caretAfter(value, taken), end: caretAfter(value, taken) });
    setValue(taken);
  };

  // Closing with words in the box discards them, and offers them back once (§5.1 rule 4); an empty box just closes.
  const dismiss = () => {
    const text = value.trim();
    if (text) onDiscard?.(text, result.ok ? result.draft.title : text);
    onClose();
  };

  return {
    value,
    /** What the box is holding instead of the line, for the one drawing before the line is written back to it. */
    holds,
    /** The line cut into plain and token runs, for painting the tokens in place. */
    painted: segments(value, spans),
    onChangeText,
    onKeyPress: (key: string) => {
      backspace.current = { was: backspace.current.now, now: key === "Backspace" };
    },
    selection,
    onSelectionChange: (start: number) => {
      setCaret(start);
      setSelection(undefined);
    },
    chips,
    destination,
    needsName,
    warnings,
    /** The draft as it would be saved, for the day line; null until the line has a name. */
    saved: draft ? asSaved(draft) : null,
    usualMin,
    takeUsual,
    /** The tag being typed, while no tag is called that: its matches, and the way to take the name as a new one. */
    tag: tagSpan && !tagKnown ? { name: tagName, suggestions: tagSuggestions, pick: (t: QuickAddTag) => replaceSpan(tagSpan, tagToken(t.name)), accept: () => replaceSpan(tagSpan, tagSpan.text) } : null,
    /** The project being named, until it is one project exactly. */
    project:
      projectName && !exact
        ? { name: projectName, suggestions: suggestions.map((p) => ({ project: p, label: projectOptionLabel(p, projects) })), collision, willCreate, pick: pickProject, create: () => setCreateProject(true) }
        : null,
    insert,
    canAdd: draft !== null && !busy,
    submit,
    dismiss,
    notice,
    error,
  };
}
