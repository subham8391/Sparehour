"use client";
// A heading that edits in place: click (or Enter) to edit, Enter or blur
// saves, Escape cancels, an empty value is discarded. Used for area and
// project names and for headings inside a project.
import { useRef, useState, type KeyboardEvent } from "react";

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
        className={`w-full bg-transparent outline-none focus:underline focus:decoration-line-strong ${className} ${inputClassName}`}
      />
    );
  }
  return (
    <Tag className={className}>
      <button type="button" onClick={start} aria-label={`Edit ${label.toLowerCase()}`} className="min-w-0 max-w-full truncate text-left hover:underline hover:decoration-line-strong">
        {value}
      </button>
    </Tag>
  );
}
