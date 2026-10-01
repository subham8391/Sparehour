"use client";
// A heading that edits in place: click (or Enter) to edit, Enter or blur
// saves, Escape cancels, an empty value is discarded. Used for area and
// project names and for headings inside a project.
import { useRef, useState, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { bareFieldClass } from "./field";

export function InlineTitle({
  value,
  onSave,
  label,
  className = "",
  inputClassName = "",
  as: Tag = "h1",
}: {
  value: string;
  onSave: (next: string) => void;
  /** Accessible name for the edit control, e.g. "Project name". */
  label: string;
  className?: string;
  inputClassName?: string;
  as?: "h1" | "h2" | "h3";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);

  const start = () => {
    setDraft(value);
    cancelled.current = false;
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    if (cancelled.current) return;
    const next = draft.trim();
    if (next && next !== value) onSave(next);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelled.current = true;
      (e.target as HTMLInputElement).blur();
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        className={cx(bareFieldClass(), "w-full", className, inputClassName)}
      />
    );
  }
  return (
    <Tag className={className}>
      {/* The dashed rule says "editable" without a hover, and the 44 px minimum makes it a target on a phone.
          The button (and so the heading) is named by the visible title with ", edit" after it: the name starts
          with the words on screen (WCAG 2.5.3 Label in Name), and the text itself stays just the title. */}
      <button
        type="button"
        onClick={start}
        aria-label={`${value}, edit`}
        title={`Edit ${label.toLowerCase()}`}
        className="inline-flex min-h-11 max-w-full items-center rounded-sm text-left underline decoration-line decoration-dashed decoration-1 underline-offset-[6px] transition-[text-decoration-color] dur-fast hover:decoration-line-strong sm:min-h-0"
      >
        <span className="min-w-0 truncate">{value}</span>
      </button>
    </Tag>
  );
}
