"use client";
// The bulk-edit bar (PRODUCT_SPEC.md "Multi-select + bulk edit"; SCREENS.md
// §24): appears while rows are ticked, sits above the tab bar on the phone
// and above the quick-add bar elsewhere. A raised panel (DESIGN_SYSTEM.md
// §4: surface-3, the ink shadow in light, a hairline in dark) of quiet
// buttons, 44 px on the phone. Every action is one write with one undo
// entry, then the ticks clear. Escape clears them without a write.
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
import { Button, buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
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
// Every action is the quiet button, a touch closer together than the default so the bar stays one line.
const QUIET = cx(buttonClass({ variant: "quiet" }), "px-2.5");
// The date and tag fields wear the same look as the buttons; their inputs carry no ring, the row does.
const FIELD = cx(QUIET, "cursor-pointer gap-1 focus-within:bg-hover focus-within:text-ink");

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

  // Escape lets go of the ticks, unless a panel or the task detail wants the key first.
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
    // The actions wrap onto more lines rather than scroll: a scroll box would clip the menus that open upward from the bar.
    <div
      role="toolbar"
      aria-label="Bulk edit"
      className="fixed inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] z-30 mx-auto flex max-w-4xl flex-wrap items-center gap-x-0.5 gap-y-1 rounded-xl border border-raised-border bg-surface-3 px-2 py-2 shadow-raised sm:bottom-16 sm:inset-x-6"
    >
      <span className="mr-2 ml-1.5 shrink-0 whitespace-nowrap text-body text-ink-2">
        <b className="font-semibold text-ink num">{count}</b> selected
      </span>
      <Button variant="quiet" className="px-2.5 text-ink" onClick={() => patch({ doDate: today, doTime: null, evening: false }, "Moved {title} to today")}>
        Today
      </Button>
      <Button variant="quiet" className="px-2.5" onClick={() => patch({ doDate: tomorrow, doTime: null, evening: false }, "Moved {title} to tomorrow")}>
        Tomorrow
      </Button>
      <label className={FIELD}>
        <Icon name="calendar" size={16} className="shrink-0" />
        <span className="sr-only">Pick a date</span>
        <input type="date" aria-label="Pick a date" className="w-30 bg-transparent text-body-sm text-ink outline-none num focus-visible:outline-none" onChange={(e) => e.target.value && patch({ doDate: localDate(e.target.value), doTime: null, evening: false }, "Moved {title}")} />
      </label>
      <MenuButton label="Project" text="Project…" align="left" direction="up" className={QUIET}>
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
      <MenuButton label="Priority" text="Priority" align="left" direction="up" className={QUIET}>
        {(close) =>
          PRIORITIES.map((x) => (
            <button key={x.value} type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), patch({ priority: x.value }, `Set {title} to ${x.label.toLowerCase()} priority`))}>
              {x.label}
            </button>
          ))
        }
      </MenuButton>
      <MenuButton label="Estimate" text="Estimate" align="left" direction="up" className={QUIET}>
        {(close) => (
          <>
            {ESTIMATES.map((m) => (
              <button key={m} type="button" role="menuitem" className={cx(MENU_ITEM, "num")} onClick={() => (close(), patch({ estimateMin: m }, `Estimated {title} at ${formatMinutes(m)}`))}>
                {formatMinutes(m)}
              </button>
            ))}
            <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (close(), patch({ estimateMin: null }, "Cleared the estimate on {title}"))}>
              No estimate
            </button>
          </>
        )}
      </MenuButton>
      <label className={FIELD}>
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
          className="w-20 bg-transparent text-body-sm text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none"
        />
      </label>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <Button variant="quiet" className="px-2.5" onClick={() => void repo.completeMany(ids).then(done)}>
        Complete
      </Button>
      <Button variant="quiet" className="px-2.5" onClick={() => void repo.setStateMany(ids, "someday").then(done)}>
        Someday
      </Button>
      <Button variant="quiet" className="px-2.5" onClick={() => void repo.setStateMany(ids, "dropped").then(done)}>
        Drop
      </Button>
      <button
        type="button"
        aria-label="Clear the selection"
        title="Clear the selection (Esc)"
        onClick={done}
        className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-2 transition-[background-color,color] dur-fast hover:bg-hover hover:text-ink sm:size-9"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
