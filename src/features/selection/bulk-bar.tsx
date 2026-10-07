"use client";
// The bulk-edit bar (PRODUCT_SPEC.md "Multi-select + bulk edit"; SCREENS.md
// §24): appears while rows are ticked. On a phone it is a sheet docked above
// the tab bar — a "3 selected · Done" header over 48 px rows — and from `sm`
// up the same actions are one floating line above the quick-add bar. Either
// way it is the raised panel (DESIGN_SYSTEM.md §4: surface-3, the ink shadow
// in light, a hairline in dark). Every action is one write with one undo
// entry, then the ticks clear. Escape clears them without a write.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useQuery } from "@/data/powersync";
import { formatMinutes, localDate } from "@/core/time";
import type { Priority } from "@/core/types";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { projectOptionLabel, withAreaNames } from "@/data/queries/project-label";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { onBulkField } from "@/features/tasks/bulk-field-request";
import { ESTIMATE_PRESETS } from "@/features/tasks/estimate-presets";
import { useTaskDetail, type DetailField } from "@/features/tasks/task-detail";
import { useTagRepo } from "@/features/tasks/use-repos";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Button, buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { DateField } from "@/ui/date-field";
import { Input } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { MENU_ITEM, MenuButton } from "@/ui/popover";
import { RAISED } from "@/ui/sheet";
import { useSelection } from "./selection-provider";

// The picker D, ⇧D, ⇧S and E open for every ticked row (it shares the task detail's pickers): fetched when asked for.
const BulkField = dynamic(() => import("@/features/tasks/bulk-field").then((m) => m.BulkField), { ssr: false });

const SPACE_SQL = `select personal_space_id from users limit 1`;
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
  const tagRepo = useTagRepo();
  const now = useNow();
  const { today } = useLocalDay(now);
  const detail = useTaskDetail();
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const [tag, setTag] = useState("");
  // D, ⇧D, ⇧S or E with these rows ticked: one picker for all of them.
  const [picking, setPicking] = useState<DetailField | null>(null);
  useEffect(() => onBulkField(setPicking), []);
  const count = ids.length;

  // Escape lets go of the ticks, unless a panel or the task detail wants the key first.
  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || detail.selectedId || picking || isTypingTarget(e.target)) return;
      sel.clearChecks();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, detail.selectedId, picking, sel]);

  if (count === 0) return null;
  // Two projects of one name show their area beside it (PRODUCT_SPEC.md §5.4).
  const projects = withAreaNames(projectRows ?? [], areaRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", area: p.area }));
  const spaceId = users?.[0]?.personal_space_id ?? null;
  const done = () => sel.clearChecks();
  const patch = (p: TaskPatch, note?: string) => void repo.updateMany(ids, p, note).then(done);
  const tomorrow = today.add({ days: 1 });
  // One write for the lot, with one undo toast ("Tagged 2 tasks @urgent") that takes back only the new links.
  const addTag = () => {
    const name = tag.trim().replace(/^@/, "");
    if (!name || !spaceId) return;
    void tagRepo.attachMany(ids, spaceId, name).then(() => {
      setTag("");
      done();
    });
  };

  return (
    <>
      {/* Neither band scrolls its actions: a scroll box would clip the menus that open upward from the bar. */}
    <div
      role="toolbar"
      aria-label="Bulk edit"
      className={cx(
        RAISED,
        // The phone: a sheet flush above the tab bar.
        // From `sm` up it floats over the list column it is mounted in (app-shell), never over the sidebar or the detail pane.
        "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col rounded-t-sheet max-sm:shadow-sheet sm:absolute",
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
                  {projectOptionLabel(p, projects)}
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
              {ESTIMATE_PRESETS.map((m) => (
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
    {picking && <BulkField ids={ids} field={picking} onDone={done} onClose={() => setPicking(null)} />}
    </>
  );
}
