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
    <li className="flex min-h-14 items-center border-t border-line first:border-t-0 sm:min-h-11">
      <span className="flex size-11 shrink-0 items-center justify-center text-ink-2" aria-hidden="true">
        <Icon name="plus" size={16} />
      </span>
      {/* The focus ring sits inside the 44 px line so it never crosses the hairlines; the padding keeps the text on the title column. */}
      <input
        autoFocus={autoFocus}
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        autoComplete="off"
        className="-ml-2 mr-4 h-11 min-w-0 flex-1 rounded-sm bg-transparent px-2 text-base text-ink placeholder:text-ink-4 focus-visible:-outline-offset-2 sm:text-body-lg"
      />
    </li>
  );
}
