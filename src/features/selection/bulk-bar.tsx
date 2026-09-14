"use client";
// The bulk-edit bar (PRODUCT_SPEC.md "Multi-select + bulk edit"; SCREENS.md
// §24): appears while rows are ticked, sits above the tab bar on the phone
// and above the quick-add bar elsewhere. Every action is one write with one
// undo entry, then the ticks clear. Escape clears them without a write.
import { useEffect, useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { formatMinutes, localDate } from "@/core/time";
import type { Priority } from "@/core/types";
import { PROJECTS_SQL, type ProjectRow } from "@/data/queries/nav";
import { TagRepo } from "@/data/repositories/tag-repo";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Icon } from "@/ui/icons";
import { MENU_ITEM, MenuButton } from "@/ui/popover";
import { useSelection } from "./selection-provider";

const SPACE_SQL = `select personal_space_id from users limit 1`;
const ESTIMATES = [15, 25, 30, 45, 60, 90, 120];
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 3, label: "!1 High" },
  { value: 2, label: "!2 Medium" },
  { value: 1, label: "!3 Low" },
  { value: 0, label: "None" },
];
const BTN = "flex h-9 shrink-0 items-center rounded-lg px-2.5 text-[13px] text-ink-2 hover:bg-paper hover:text-ink";

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest?.("input, textarea, select, [contenteditable='true']"));
}

export function BulkBar() {
  const sel = useSelection();
  const ids = sel.checkedIds;
  const repo = useTaskRepo();
  const db = useLocalDatabase();
  const tagRepo = useMemo(() => new TagRepo(db), [db]);
  const now = useNow();
  const { today } = useLocalDay(now);
  const detail = useTaskDetail();
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const [tag, setTag] = useState("");
  const count = ids.length;

  // Escape lets go of the ticks — unless a panel or the task detail wants the key first.
  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || detail.selectedId || isTypingTarget(e.target)) return;
      sel.clearChecks();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, detail.selectedId, sel]);

  if (count === 0) return null;
  const projects = (projectRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project" }));
  const spaceId = users?.[0]?.personal_space_id ?? null;
  const done = () => sel.clearChecks();
  const patch = (p: TaskPatch, note?: string) => void repo.updateMany(ids, p, note).then(done);
  const tomorrow = today.add({ days: 1 });
  const addTag = () => {
    const name = tag.trim().replace(/^@/, "");
    if (!name || !spaceId) return;
    void Promise.all(ids.map((id) => tagRepo.attach(id, spaceId, name))).then(() => {
      setTag("");
      done();
    });
  };

  return (
    <div role="toolbar" aria-label="Bulk edit" className="fixed inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-30 mx-auto flex max-w-4xl items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface px-3 py-2 shadow-lg sm:bottom-16 sm:inset-x-6">
      <span className="mr-2 shrink-0 font-display text-lg text-ink">
        {count} <span className="text-[13px] font-sans text-ink-2">selected</span>
      </span>
      <button type="button" className={`${BTN} font-medium text-ink`} onClick={() => patch({ doDate: today, doTime: null, evening: false }, "Moved {title} to today")}>
        Today
      </button>
      <button type="button" className={BTN} onClick={() => patch({ doDate: tomorrow, doTime: null, evening: false }, "Moved {title} to tomorrow")}>
        Tomorrow
      </button>
      <label className={`${BTN} cursor-pointer gap-1`}>
        <Icon name="calendar" size={14} />
        <span className="sr-only">Pick a date</span>
        <input type="date" aria-label="Pick a date" className="w-[7.5rem] bg-transparent text-[13px] text-ink outline-none" onChange={(e) => e.target.value && patch({ doDate: localDate(e.target.value), doTime: null, evening: false }, "Moved {title}")} />
      </label>
      <MenuButton label="Project" text="Project…" align="left">
        {(close) => (
          <>
            <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), patch({ projectId: null }, "Moved {title} out of its project"))}>
              No project
            </button>
            {projects.map((p) => (
              <button key={p.id} type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), patch({ projectId: p.id }, `Moved {title} to ${p.name}`))}>
                {p.name}
              </button>
            ))}
          </>
        )}
      </MenuButton>
      <MenuButton label="Priority" text="Priority" align="left">
        {(close) =>
          PRIORITIES.map((x) => (
            <button key={x.value} type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), patch({ priority: x.value }, `Set {title} to ${x.label.toLowerCase()} priority`))}>
              {x.label}
            </button>
          ))
        }
      </MenuButton>
      <MenuButton label="Estimate" text="Estimate" align="left">
        {(close) => (
          <>
            {ESTIMATES.map((m) => (
              <button key={m} type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), patch({ estimateMin: m }, `Estimated {title} at ${formatMinutes(m)}`))}>
                {formatMinutes(m)}
              </button>
            ))}
            <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), patch({ estimateMin: null }, "Cleared the estimate on {title}"))}>
              No estimate
            </button>
          </>
        )}
      </MenuButton>
      <label className={`${BTN} gap-1`}>
        <span className="text-ink-3">@</span>
        <input
          aria-label="Add a tag"
          placeholder="tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          className="w-20 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
      </label>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <button type="button" className={BTN} onClick={() => void repo.completeMany(ids).then(done)}>
        Complete
      </button>
      <button type="button" className={BTN} onClick={() => void repo.setStateMany(ids, "someday").then(done)}>
        Someday
      </button>
      <button type="button" className={BTN} onClick={() => void repo.setStateMany(ids, "dropped").then(done)}>
        Drop
      </button>
      <span className="flex-1" />
      <button type="button" aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={done} className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-paper hover:text-ink">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
