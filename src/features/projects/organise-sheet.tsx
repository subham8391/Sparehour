"use client";
// The tap path for organising areas and projects (DECISIONS.md "a tap
// alternative for every drag"; SCREENS.md §1, §9): an area's or a project's ⋯
// in Browse opens this sheet — Move up, Move down, and "Move to area…" for a
// project or "Delete area…" for an area. The project header's "Move to area…"
// and the area view's "Delete area…" open it straight at that step. A bottom
// sheet on the phone, a small dialog above it. Loaded on demand (next/dynamic),
// so neither the picker nor the confirmation rides in a first download.
import { useState } from "react";
import { useQuery } from "@/data/powersync";
import type { NavTree } from "@/features/shell/nav-drag";
import { useNavData } from "@/features/shell/use-nav-data";
import { useAreaRepo, useProjectOrderRepo } from "@/features/tasks/use-repos";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { MENU_ITEM, MENU_ITEM_DESTRUCTIVE } from "@/ui/popover";
import { Sheet } from "@/ui/sheet";

export type OrganiseTarget = { kind: "area"; id: string; name: string } | { kind: "project"; id: string; name: string };
export type OrganiseStep = "menu" | "move" | "delete";

/** What deleting an area leaves without one: its projects (any state) and the tasks filed in it directly. */
export const AREA_CONTENTS_SQL = `
  select (select count(*) from projects where deleted_at is null and area_id = ?1) as projects,
         (select count(*) from tasks where deleted_at is null and area_id = ?1) as tasks`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The sentence under "Delete “Work”?": what stays, and where. */
export function deleteAreaNote(projects: number, tasks: number): string {
  const parts = [projects > 0 && plural(projects, "project", "projects"), tasks > 0 && plural(tasks, "task", "tasks")].filter(Boolean);
  if (parts.length === 0) return "Nothing is filed in it.";
  const what = parts.join(" and ");
  return `Its ${what} stay${projects + tasks === 1 ? "s" : ""}, without an area.`;
}

/** The area or project's place in the tree: its group, and its index there (among the areas, for an area). */
function placeOf(tree: readonly NavTree[], target: OrganiseTarget): { list: readonly string[]; index: number; areaId: string | null } | null {
  if (target.kind === "area") {
    const list = tree.filter((g) => !g.loose).map((g) => g.id);
    return { list, index: list.indexOf(target.id), areaId: null };
  }
  const group = tree.find((g) => g.projects.some((p) => p.id === target.id));
  if (!group) return null;
  const list = group.projects.map((p) => p.id);
  return { list, index: list.indexOf(target.id), areaId: group.loose ? null : group.id };
}

export function OrganiseSheet({ target, step: initial = "menu", onClose, onDeleted }: { target: OrganiseTarget; step?: OrganiseStep; onClose: () => void; onDeleted?: () => void }) {
  const { areas: tree } = useNavData();
  const areaRepo = useAreaRepo();
  const projectOrder = useProjectOrderRepo();
  const [step, setStep] = useState<OrganiseStep>(initial);
  const place = placeOf(tree, target);
  const realAreas = tree.filter((g) => !g.loose);
  const { data: contents } = useQuery<{ projects: number; tasks: number }>(target.kind === "area" && step === "delete" ? AREA_CONTENTS_SQL : `select 0 as projects, 0 as tasks where 0`, target.kind === "area" && step === "delete" ? [target.id] : []);

  const nudge = (dir: -1 | 1) => {
    if (!place) return;
    const index = place.index + dir;
    if (index < 0 || index >= place.list.length) return;
    if (target.kind === "area") void areaRepo.move(target.id, index);
    else void projectOrder.move(target.id, { areaId: place.areaId, index });
    onClose();
  };
  const moveTo = (areaId: string | null) => {
    if (target.kind !== "project") return;
    if (place && place.areaId === areaId) return onClose();
    const dest = tree.find((g) => (areaId ? g.id === areaId : g.loose));
    void projectOrder.move(target.id, { areaId, index: dest?.projects.length ?? 0 }, dest && !dest.loose ? dest.name : null);
    onClose();
  };
  const remove = () => {
    if (target.kind !== "area") return;
    void areaRepo.remove(target.id);
    onClose();
    onDeleted?.();
  };

  const title = step === "move" ? `Move “${target.name}” to` : step === "delete" ? `Delete “${target.name}”?` : target.name;
  return (
    <Sheet label={step === "move" ? "Move to area" : step === "delete" ? "Delete area" : `Organise ${target.name}`} onClose={onClose} align="center" width="sm">
      <div className="flex flex-col gap-3 px-3 pt-2 pb-4 sm:pt-4">
        <h2 className="truncate px-2.5 text-body-lg font-semibold text-ink">{title}</h2>
        {step === "menu" && place && (
          <div role="menu" aria-label={`Organise ${target.name}`} className="flex flex-col gap-0.5">
            <button type="button" role="menuitem" className={cx(MENU_ITEM, "gap-3 disabled:text-ink-4")} disabled={place.index <= 0} onClick={() => nudge(-1)}>
              <Icon name="arrow-up" size={16} className="text-ink-2" /> Move up
            </button>
            <button type="button" role="menuitem" className={cx(MENU_ITEM, "gap-3 disabled:text-ink-4")} disabled={place.index >= place.list.length - 1} onClick={() => nudge(1)}>
              <Icon name="arrow-down" size={16} className="text-ink-2" /> Move down
            </button>
            {target.kind === "project" ? (
              <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => setStep("move")}>
                Move to area…
              </button>
            ) : (
              <button type="button" role="menuitem" className={MENU_ITEM_DESTRUCTIVE} onClick={() => setStep("delete")}>
                Delete area…
              </button>
            )}
          </div>
        )}
        {step === "move" && (
          <div role="menu" aria-label="Areas" className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            {realAreas.map((a) => (
              <button key={a.id} type="button" role="menuitemradio" aria-checked={place?.areaId === a.id} className={cx(MENU_ITEM, "aria-checked:bg-surface-2")} onClick={() => moveTo(a.id)}>
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {place?.areaId === a.id && <Icon name="check" size={16} className="text-ink-2" />}
              </button>
            ))}
            <button type="button" role="menuitemradio" aria-checked={place?.areaId === null} className={cx(MENU_ITEM, "text-ink-2 aria-checked:bg-surface-2")} onClick={() => moveTo(null)}>
              <span className="min-w-0 flex-1 truncate">No area</span>
              {place?.areaId === null && <Icon name="check" size={16} className="text-ink-2" />}
            </button>
          </div>
        )}
        {step === "delete" && (
          <>
            <p className="px-2.5 text-body text-pretty text-ink-2">{deleteAreaNote(contents?.[0]?.projects ?? 0, contents?.[0]?.tasks ?? 0)}</p>
            <div className="flex flex-col-reverse gap-2 px-2.5 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={onClose}>
                Keep
              </Button>
              {/* Delete is one of the two destructive actions in the product (DESIGN_SYSTEM.md §2); the toast undoes it. */}
              <Button variant="primary" tone="destructive" onClick={remove}>
                Delete area
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
