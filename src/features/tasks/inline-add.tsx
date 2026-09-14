"use client";
// The "+ add" row at the end of a list (SCREENS.md §9): one line, parsed
// like quick-add, saved on Enter, ready for the next.
import { useState, type KeyboardEvent } from "react";
import { parse, type ParseContext, type TaskDraft } from "@/core/quickadd";
import { Icon } from "@/ui/icons";

export function InlineAdd({
  ctx,
  onAdd,
  placeholder = "Add a task",
  autoFocus = false,
}: {
  ctx: ParseContext;
  onAdd: (draft: TaskDraft) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    const r = parse(value, ctx);
    if (!r.ok) return;
    onAdd(r.draft);
    setValue("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      setValue("");
      (e.target as HTMLInputElement).blur();
    }
  };
  return (
    <li className="flex min-h-11 items-center gap-3 px-4">
      <Icon name="plus" size={16} className="shrink-0 text-ink-3" />
      <input
        autoFocus={autoFocus}
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        autoComplete="off"
        className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
      />
    </li>
  );
}
