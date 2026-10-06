"use client";
// A Markdown note, rendered and edited in place (PRODUCT_SPEC.md §6 "Notes",
// SCREENS.md §9–§10). At rest the note is drawn as Markdown; a click or tap
// on it, or Enter while it has focus, opens the editor right there, and blur
// or Escape saves and draws it again. A link opens in a new tab without
// starting an edit. An empty note is simply the editor with its placeholder.
// The renderer is a lazy chunk: it loads when a note with words is on screen,
// and until then the words show as plain text.
import { lazy, Suspense, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { Textarea } from "./field";

const loadMarkdown = () => import("./markdown");
const Markdown = lazy(() => loadMarkdown().then((m) => ({ default: m.Markdown })));

/** Starts fetching the renderer (an idle preload from a view that is about to show notes). */
export const preloadMarkdown = (): Promise<unknown> => loadMarkdown();

const same = (a: string | null | undefined, b: string | null | undefined) => (a?.trim() || null) === (b?.trim() || null);

export function NoteField({
  value,
  onSave,
  label,
  placeholder,
  rows = 4,
  className,
  editorClassName,
}: {
  value: string | null;
  /** Called on blur or Escape when the words changed: the trimmed text, or null for an empty note. */
  onSave: (next: string | null) => void;
  /** The accessible name of the note and of its editor ("Notes", "Project notes"). */
  label: string;
  placeholder: string;
  rows?: number;
  className?: string;
  editorClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const rendered = useRef<HTMLDivElement>(null);
  const backToNote = useRef(false);
  const hintId = useId();
  const hasWords = Boolean(value?.trim());

  // Drawn again after an Escape: focus returns to the note, so the keyboard stays where it was.
  useEffect(() => {
    if (editing || !backToNote.current) return;
    backToNote.current = false;
    rendered.current?.focus();
  }, [editing]);

  const open = () => {
    setDraft(value ?? "");
    setEditing(true);
  };
  const save = (text: string) => {
    if (!same(text, value)) onSave(text.trim() || null);
    setEditing(false);
  };
  const onEditorKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Escape") return;
    // The note keeps the key: Escape closes the editor, not the panel around it.
    e.preventDefault();
    e.stopPropagation();
    backToNote.current = hasWords || Boolean(e.currentTarget.value.trim());
    e.currentTarget.blur();
  };

  if (editing || !hasWords) {
    const text = editing ? draft : (value ?? "");
    return (
      <Textarea
        aria-label={label}
        value={text}
        autoFocus={editing}
        onFocus={(e) => {
          if (!editing) {
            setDraft(value ?? "");
            setEditing(true);
          }
          // The caret goes after the last word, where a note is added to.
          const end = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(end, end);
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          if (!editing) setEditing(true);
        }}
        onBlur={(e) => save(e.target.value)}
        onKeyDown={onEditorKey}
        placeholder={placeholder}
        rows={rows}
        className={cx("resize-y [field-sizing:content]", editorClassName)}
      />
    );
  }

  return (
    <>
    <span id={hintId} className="sr-only">
      Press Enter to edit
    </span>
    <div
      ref={rendered}
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={0}
      onClick={(e) => {
        // A selection being made (copying a line out of the note) is not a request to edit it.
        if (window.getSelection?.()?.toString() && rendered.current?.contains(window.getSelection()?.anchorNode ?? null)) return;
        if ((e.target as HTMLElement).closest("a")) return;
        open();
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        open();
      }}
      className={cx(
        "min-h-11 cursor-text rounded-lg border border-transparent px-3 py-2 text-base leading-6 text-ink transition-colors dur-fast hover:border-line focus-visible:border-line sm:text-body sm:leading-5",
        className,
      )}
    >
      <Suspense fallback={<p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</p>}>
        <Markdown source={value ?? ""} />
      </Suspense>
    </div>
    </>
  );
}
