"use client";
// A Markdown note, rendered and edited in place (PRODUCT_SPEC.md §6 "Notes",
// SCREENS.md §9–§10). At rest the note is drawn as Markdown; a click or tap
// on it, or Enter while it has focus, opens the editor right there, and blur
// or Escape saves and draws it again. A link opens in a new tab without
// starting an edit. An empty note is simply the editor with its placeholder.
// The renderer is a lazy chunk: it loads when a note with words is on screen,
// and until then the words show as plain text.
import { lazy, Suspense, useEffect, useId, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from "react";
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
  // What was just saved, shown until the store hands the note back: the write is local but not instant, and
  // without it a first note would blank for a moment (the old value is still empty) and lose the focus Escape keeps.
  const [saved, setSaved] = useState<{ text: string | null } | null>(null);
  const [seenValue, setSeenValue] = useState(value);
  if (seenValue !== value) {
    setSeenValue(value);
    setSaved(null);
  }
  const shown = saved ? saved.text : value;
  const rendered = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const backToNote = useRef(false);
  const hintId = useId();
  const hasWords = Boolean(shown?.trim());
  // An edit still open when the field goes away (the panel closed, the route changed) is saved, not dropped:
  // a removed textarea gets no blur.
  const live = useRef({ editing, draft, shown, onSave });
  useEffect(() => {
    live.current = { editing, draft, shown, onSave };
  });
  useEffect(
    () => () => {
      const l = live.current;
      if (l.editing && !same(l.draft, l.shown)) l.onSave(l.draft.trim() || null);
    },
    [],
  );

  useEffect(() => {
    if (editing) {
      // Opened from the drawn note: the caret goes after the last word, where a note is added to.
      const el = editorRef.current;
      if (el && document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === 0) el.setSelectionRange(el.value.length, el.value.length);
      return;
    }
    // Drawn again after an Escape: focus returns to the note, so the keyboard stays where it was.
    if (!backToNote.current) return;
    backToNote.current = false;
    rendered.current?.focus();
  }, [editing]);

  const open = () => {
    setDraft(shown ?? "");
    setEditing(true);
  };
  const save = (text: string) => {
    live.current.editing = false;
    if (!same(text, shown)) {
      onSave(text.trim() || null);
      setSaved({ text: text.trim() || null });
    }
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
    const editor = {
      "aria-label": label,
      value: editing ? draft : (shown ?? ""),
      autoFocus: editing,
      ref: editorRef,
      onFocus: () => {
        if (editing) return;
        setDraft(shown ?? "");
        setEditing(true);
      },
      onChange: (e: ChangeEvent<HTMLTextAreaElement>) => {
        setDraft(e.target.value);
        if (!editing) setEditing(true);
      },
      onBlur: (e: FocusEvent<HTMLTextAreaElement>) => save(e.target.value),
      onKeyDown: onEditorKey,
      placeholder,
      rows,
    };
    // A caller that draws the note inside its own card passes the editor's whole look; else it is the field primitive.
    return editorClassName ? <textarea {...editor} className={editorClassName} /> : <Textarea {...editor} className="resize-y [field-sizing:content]" />;
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
          "min-h-11 cursor-text text-base leading-6 text-ink transition-colors dur-fast sm:text-body sm:leading-5",
          // Where the editor will be: the field's box and padding, its border drawn only on hover and focus.
          className ?? "rounded-lg border border-transparent px-3 py-2 hover:border-line focus-visible:border-line",
        )}
      >
        <Suspense fallback={<p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{shown}</p>}>
          <Markdown source={shown ?? ""} />
        </Suspense>
      </div>
    </>
  );
}
