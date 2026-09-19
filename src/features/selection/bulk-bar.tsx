"use client";
// The bulk-edit bar (PRODUCT_SPEC.md "Multi-select + bulk edit"; SCREENS.md
// §24): appears while rows are ticked. On a phone it is a sheet docked above
// the tab bar — a "3 selected · Done" header over 48 px rows — and from `sm`
// up the same actions are one floating line above the quick-add bar. Either
// way it is the raised panel (DESIGN_SYSTEM.md §4: surface-3, the ink shadow
// in light, a hairline in dark). Every action is one write with one undo
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
import { DateField } from "@/ui/date-field";
import { Input } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { MENU_ITEM, MenuButton } from "@/ui/popover";
import { RAISED } from "@/ui/sheet";
import { useSelection } from "./selection-provider";

const SPACE_SQL = `select personal_space_id from users limit 1`;
const ESTIMATES = [15, 25, 30, 45, 60, 90, 120];
const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 3, label: "!1 High" },
  { value: 2, label: "!2 Medium" },
  { value: 1, label: "!3 Low" },
  { value: 0, label: "None" },
];
// Every action is the quiet button: a full-width 48 px row in the phone sheet, a touch
// closer together than the default from `sm` up so the bar stays one line.
const ACTION = "max-sm:min-h-12 max-sm:justify-start max-sm:rounded-lg max-sm:px-2 sm:px-2.5";
const QUIET = cx(buttonClass({ variant: "quiet" }), ACTION);
// The two fields go last on the phone, where each takes a row of its own.
const FIELD = "max-sm:order-1 max-sm:col-span-2 max-sm:w-full";

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
    // Neither band scrolls its actions: a scroll box would clip the menus that open upward from the bar.
    <div
      role="toolbar"
      aria-label="Bulk edit"
      className={cx(
        RAISED,
        // The phone: a sheet flush above the tab bar.
        "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col rounded-t-sheet max-sm:shadow-sheet",
        // From `sm` up: one floating line that wraps rather than scrolls.
        "sm:inset-x-6 sm:bottom-16 sm:mx-auto sm:max-w-5xl sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-0.5 sm:gap-y-1 sm:rounded-xl sm:px-2 sm:py-2",
      )}
    >
      {/* The phone's header says what is held and how to let go; from `sm` the count sits at the head of the line instead. */}
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-line pr-2 pl-4 sm:hidden">
        <span className="text-body text-ink-2">
          <b className="font-semibold text-ink num">{count}</b> selected
        </span>
        <Button variant="link" onClick={done}>
          Done
        </Button>
      </div>
      <span className="mr-2 ml-1.5 shrink-0 whitespace-nowrap text-body text-ink-2 max-sm:hidden">
        <b className="font-semibold text-ink num">{count}</b> selected
      </span>
      {/* Two columns of 48 px rows on the phone; from `sm` the actions join the bar's own line. */}
      <div className="grid grid-cols-2 items-center gap-x-1 gap-y-0.5 p-2 sm:contents">
        <Button variant="quiet" className={cx(ACTION, "text-ink")} onClick={() => patch({ doDate: today, doTime: null, evening: false }, "Moved {title} to today")}>
          Today
        </Button>
        <Button variant="quiet" className={ACTION} onClick={() => patch({ doDate: tomorrow, doTime: null, evening: false }, "Moved {title} to tomorrow")}>
          Tomorrow
        </Button>
        <DateField
          aria-label="Pick a date"
          placeholder="Pick a date"
          value=""
          today={today}
          className={cx(FIELD, "sm:w-32")}
          onChange={(e) => e.target.value && patch({ doDate: localDate(e.target.value), doTime: null, evening: false }, "Moved {title}")}
        />
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
        <Input aria-label="Add a tag" placeholder="@tag" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => (e.key === "Enter" ? (e.preventDefault(), addTag()) : undefined)} className={cx(FIELD, "sm:w-24")} />
        <span className="mx-1 h-5 w-px shrink-0 bg-line max-sm:hidden" aria-hidden="true" />
        <Button variant="quiet" className={ACTION} onClick={() => void repo.completeMany(ids).then(done)}>
          Complete
        </Button>
        <Button variant="quiet" className={ACTION} onClick={() => void repo.setStateMany(ids, "someday").then(done)}>
          Someday
        </Button>
        {/* Drop is undoable, so it stays ink (DESIGN_SYSTEM.md §2). */}
        <Button variant="quiet" className={ACTION} onClick={() => void repo.setStateMany(ids, "dropped").then(done)}>
          Drop
        </Button>
        <Button variant="icon" aria-label="Clear the selection" title="Clear the selection (Esc)" onClick={done} className="ml-auto max-sm:hidden">
          <Icon name="close" size={16} />
        </Button>
      </div>
    </div>
  );
}
