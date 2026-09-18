"use client";
// Quick-add (SCREENS.md §11): one line in, a task out. Tokens are painted in
// place as they complete, the strip below restates the parse in plain
// English, ⏎ saves and keeps going, ⌘⏎ saves and closes, esc discards. On a
// phone it is a bottom sheet docked above the keyboard; from the narrow band
// up, an overlay. Presentational and testable: data arrives as props.
import { useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { parse, type Span, type TaskDraft } from "@/core/quickadd";
import type { Instant, LocalDate, LocalTime } from "@/core/time";
import { Icon } from "@/ui/icons";
import { interpret, projectMatches, projectToken, resolveProject, segments, splitPaste, type QuickAddProject } from "./interpret";
import { Kbd } from "@/ui/kbd";

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

const TOKEN_TONE: Record<Span["kind"], string> = {
  protected: "",
  datetime: "bg-surface-2 text-ink",
  project: "bg-spare-soft text-spare",
  tag: "bg-meet-soft text-meet",
  estimate: "bg-surface-2 text-ink",
  priority: "bg-over-soft text-over",
  deadline: "bg-deadline-soft text-deadline",
  start: "bg-surface-2 text-ink",
  recurrence: "bg-surface-2 text-ink",
  evening: "bg-over-soft text-over",
  notes: "text-ink-3",
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


export function QuickAdd({
  open,
  initial = "",
  projects,
  ctx,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: string;
  projects: readonly QuickAddProject[];
  ctx: QuickAddContext;
  onClose: () => void;
  onSubmit: (submission: QuickAddSubmission) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [createProject, setCreateProject] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Why the last save failed; the words stay in the box so nothing is lost. */
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const paintRef = useRef<HTMLDivElement>(null);
  const stripId = useId();

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
  const match = resolveProject(projectName, projects);
  const suggestions = projectName && !match ? projectMatches(projectName, projects).slice(0, 3) : [];
  const willCreate = Boolean(projectName) && !match && (createProject || Boolean(draft?.projectCreate));
  const projectLabel = match ? match.name : projectName ? (willCreate ? `new project ${projectName}` : `${projectName}?`) : null;
  const interpretation = draft ? interpret(draft, ctx.today, projectLabel) : null;

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
  const submit = async (close: boolean) => {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        draft: { ...draft, projectCreate: willCreate },
        projectId: match?.id ?? null,
        createProjectName: willCreate ? projectName : null,
      });
      setValue("");
      setCreateProject(false);
      setNotice(`Added “${draft.title}”`);
      if (close) onClose();
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error && e.message ? e.message : "Couldn't save that — try again.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit(e.metaKey || e.ctrlKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab" && projectName && !match) {
      e.preventDefault();
      if (suggestions.length > 0) pickProject(suggestions[0]);
      else setCreateProject(true);
    }
  };

  const onPaste = async (e: ClipboardEvent<HTMLInputElement>) => {
    const lines = splitPaste(e.clipboardData.getData("text"));
    if (lines.length === 0) return;
    e.preventDefault();
    setBusy(true);
    let added = 0;
    try {
      for (const line of lines) {
        const r = parse(line, parseCtx);
        if (!r.ok) continue;
        await onSubmit({ draft: r.draft, projectId: resolveProject(r.draft.projectName, projects)?.id ?? null, createProjectName: null });
        added += 1;
      }
    } finally {
      setBusy(false);
    }
    setValue("");
    setNotice(`${added} ${added === 1 ? "task" : "tasks"} added`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-start sm:justify-center sm:pt-[12vh]">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/20" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a task"
        className="relative w-full rounded-t-[20px] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:border"
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="relative">
            <div
              ref={paintRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex h-11 items-center overflow-hidden whitespace-pre px-[calc(1rem+1.5px)] text-[15px] text-ink"
            >
              {segments(value, spans).map((s, i) =>
                s.kind ? (
                  <mark key={i} data-kind={s.kind} className={`rounded-md bg-transparent ${TOKEN_TONE[s.kind]}`}>
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
              placeholder="Add a task — e.g. Draft proposal fri 3pm ~45m #acme !1"
              className="relative h-11 w-full rounded-xl border-[1.5px] border-ink bg-transparent px-4 text-[15px] text-transparent caret-ink outline-none placeholder:text-ink-3"
            />
          </div>

          <p id={stripId} aria-live="polite" className="min-h-5 font-mono text-[12px] text-ink-2">
            {interpretation ? (
              <>
                {interpretation.strip || <span className="text-ink-3">Dates, times, ~estimates, #projects, @tags and !priority are understood.</span>}
                <span className="ml-3 text-ink-3">→ {interpretation.destination}</span>
              </>
            ) : (
              <span className="text-ink-3">Dates, times, ~estimates, #projects, @tags and !priority are understood.</span>
            )}
          </p>
          {warnings.length > 0 && (
            <p className="font-mono text-[12px] text-over">
              {warnings.map((w) => WARNING_TEXT[w.code] ?? w.code).join(" · ")}
            </p>
          )}

          {projectName && !match && (
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              {suggestions.map((p) => (
                <button key={p.id} type="button" onClick={() => pickProject(p)} className="h-9 rounded-full border border-line px-3 text-ink hover:border-line-strong">
                  {p.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCreateProject(true)}
                aria-pressed={willCreate}
                className={`h-9 rounded-full border px-3 ${willCreate ? "border-spare bg-spare-soft text-spare" : "border-line text-ink hover:border-line-strong"}`}
              >
                {willCreate ? "Will create" : "Create"} “{projectName}”
                {suggestions.length === 0 && !willCreate && <Kbd className="ml-2 max-sm:hidden">Tab</Kbd>}
              </button>
            </div>
          )}

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s.label} type="button" onClick={() => insert(s.insert)} className="h-9 shrink-0 rounded-full border border-line px-3 font-mono text-[12.5px] text-ink-2 hover:border-line-strong hover:text-ink">
                {s.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="hidden items-center gap-4 text-[12px] text-ink-3 sm:flex">
              <span>
                <Kbd>⏎</Kbd> save and keep going
              </span>
              <span>
                <Kbd>⌘⏎</Kbd> save and close
              </span>
              <span>
                <Kbd>esc</Kbd> discard
              </span>
            </p>
            <button
              type="button"
              onClick={() => void submit(false)}
              disabled={!draft || busy}
              className="h-11 w-full rounded-xl bg-ink px-5 text-[15px] font-medium text-paper disabled:opacity-50 sm:h-9 sm:w-auto"
            >
              Add
            </button>
          </div>
          {notice && (
            <p role="status" className="flex items-center gap-1.5 text-[12px] text-spare">
              <Icon name="check" size={12} /> {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-[12px] text-deadline">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const WARNING_TEXT: Record<string, string> = {
  deadline_before_do_date_swapped: "The deadline was before the do-date, so they were swapped.",
  deadline_moved_to_first_occurrence: "The deadline was before the first repeat, so it moved to that day.",
  do_date_moved_to_start_date: "“after” sets when it starts, so the day became the start date.",
};
