"use client";
// The organising island (organize.tsx asks, this answers): the `#` / `M` move picker and the `@` tag picker for
// the selected task or every ticked row — one write and one undo for the lot, then the ticks clear — Duplicate for
// a task (the copy opens) and a project (the copy opens), and the quiet notices ("Link copied", "That task isn't on
// this device."). Fetched in idle time and kept mounted, so none of it rides in a shell's first download.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { withAreaNames } from "@/data/queries/project-label";
import { TAGS_SQL, TASK_TAGS_SQL } from "@/data/queries/views";
import { TagRepo } from "@/data/repositories/tag-repo";
import { useSelection } from "@/features/selection/selection-provider";
import { useUndoSink } from "@/features/undo/undo-provider";
import { Toast } from "@/ui/toast";
import { MovePicker, type MoveTarget } from "./move-picker";
import { onOrganize, type OrganizeRequest } from "./organize";
import { useTaskDetail } from "./task-detail";
import { TagPicker } from "./tag-picker";
import { useTaskRepo } from "./use-task-repo";

type Picking = { kind: "move"; ids: readonly string[]; areas: boolean } | { kind: "tag"; ids: readonly string[] };

const NOTICE_MS = 4000;
const SPACE_SQL = `select personal_space_id from users limit 1`;
const NO_ROWS = `select id, name from tags where 0`;
const TASK_PROJECT_SQL = `select project_id from tasks where id = ?`;
const NO_COPY = "Couldn’t copy — the browser didn’t allow it.";

/** `<origin>/today?task=<id>`: Today with the task's detail open, on any device signed in (DECISIONS.md "Copy link"). */
export const taskLink = (id: string, origin = location.origin): string => `${origin}/today?task=${encodeURIComponent(id)}`;

export function OrganizeIsland() {
  const db = useLocalDatabase();
  const undo = useUndoSink();
  const repo = useTaskRepo();
  const tags = useMemo(() => new TagRepo(db, undo ?? undefined), [db, undo]);
  const detail = useTaskDetail();
  const selection = useSelection();
  const router = useRouter();
  const [picking, setPicking] = useState<Picking | null>(null);
  const [notice, setNotice] = useState<{ text: string; seq: number } | null>(null);

  // The handler reads the latest render through a ref, so it is registered once and the waiting requests run once.
  const latest = useRef({ db, undo, detail, router });
  useEffect(() => {
    latest.current = { db, undo, detail, router };
  });
  useEffect(
    () =>
      onOrganize((r: OrganizeRequest) => {
        const { db: database, undo: sink, detail: details, router: nav } = latest.current;
        switch (r.kind) {
          case "move":
            return setPicking({ kind: "move", ids: r.ids, areas: Boolean(r.areas) });
          case "tag":
            return setPicking({ kind: "tag", ids: r.ids });
          case "notice":
            return setNotice((n) => ({ text: r.text, seq: (n?.seq ?? 0) + 1 }));
          case "copy-link": {
            // Called in the same tick as the tap or key that asked (the island is loaded by then), as browsers require.
            const say = (text: string) => setNotice((n) => ({ text, seq: (n?.seq ?? 0) + 1 }));
            // No clipboard at all off a secure origin (a phone on the LAN address): say so rather than throw.
            if (!navigator.clipboard?.writeText) return say(NO_COPY);
            return void navigator.clipboard.writeText(taskLink(r.id)).then(
              () => say("Link copied"),
              () => say(NO_COPY),
            );
          }
          case "duplicate":
            // The copy opens in the detail; undoing it takes the copy off the device and the detail closes itself.
            return void import("@/data/repositories/duplicate").then(async ({ duplicateTask }) => {
              const id = await duplicateTask(database, sink ?? undefined, r.id);
              if (id) details.open(id);
            });
          case "duplicate-project":
            return void import("@/data/repositories/duplicate").then(async ({ duplicateProject }) => {
              const href = (id: string) => `/project/${encodeURIComponent(id)}`;
              const id = await duplicateProject(database, sink ?? undefined, r.id, (copy) => {
                // Undone while the copy is on screen: back to the project it was made from.
                if (window.location.pathname === href(copy)) nav.replace(href(r.id));
              });
              if (id) nav.push(href(id));
            });
        }
      }),
    [],
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const one = picking?.ids.length === 1 ? picking.ids[0] : null;
  const { data: projectRows } = useQuery<ProjectRow>(picking?.kind === "move" ? PROJECTS_SQL : NO_ROWS);
  const { data: areaRows } = useQuery<AreaRow>(picking?.kind === "move" ? AREAS_SQL : NO_ROWS);
  const { data: current } = useQuery<{ project_id: string | null }>(picking?.kind === "move" && one ? TASK_PROJECT_SQL : `select project_id from tasks where 0`, picking?.kind === "move" && one ? [one] : []);
  const { data: tagRows } = useQuery<{ id: string; name: string }>(picking?.kind === "tag" ? TAGS_SQL : NO_ROWS);
  const { data: attachedRows } = useQuery<{ id: string }>(picking?.kind === "tag" && one ? TASK_TAGS_SQL : NO_ROWS, picking?.kind === "tag" && one ? [one] : []);
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);

  // The picker acted on the ticked rows: they are let go once it has written, as the bulk bar does. One task filed
  // from its detail or its row's ⋯ while other rows are ticked leaves those ticks alone.
  const finish = (ids: readonly string[]) => () => {
    const ticked = selection.checkedIds;
    if (ticked.length > 0 && ids.length === ticked.length && ids.every((id) => ticked.includes(id))) selection.clearChecks();
  };

  const move = (ids: readonly string[], target: MoveTarget) => {
    if (target.kind === "area") {
      // tasks.area_id hook (DECISIONS.md "Loose tasks in an area"): an area target sets area_id and clears the
      // project and heading. Not offered until that column exists, so the picker never lists areas as targets.
      return;
    }
    const note = target.id ? `Moved {title} to ${target.name ?? "the project"}` : "Moved {title} out of its project";
    const write = ids.length === 1 ? repo.update(ids[0], { projectId: target.id }, note) : repo.updateMany(ids, { projectId: target.id }, note);
    void write.then(finish(ids));
  };
  const tag = (ids: readonly string[], name: string) => {
    const spaceId = users?.[0]?.personal_space_id;
    if (!spaceId) return;
    void tags.attachMany(ids, spaceId, name).then(finish(ids));
  };

  const projects = useMemo(
    () => withAreaNames(projectRows ?? [], areaRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", area: p.area, areaId: p.area_id })),
    [projectRows, areaRows],
  );
  const areaOrder = useMemo(() => (areaRows ?? []).map((a) => ({ id: a.id, name: a.name ?? "Untitled area" })), [areaRows]);

  return (
    <>
      {picking?.kind === "move" && (
        <MovePicker
          count={picking.ids.length}
          projects={projects}
          areaOrder={areaOrder}
          currentProjectId={one && current?.[0] ? current[0].project_id : undefined}
          onPick={(target) => move(picking.ids, target)}
          onClose={() => setPicking(null)}
        />
      )}
      {picking?.kind === "tag" && (
        <TagPicker
          count={picking.ids.length}
          tags={(tagRows ?? []).map((t) => ({ id: t.id, name: t.name }))}
          attached={(attachedRows ?? []).map((t) => t.id)}
          onPick={(name) => tag(picking.ids, name)}
          onClose={() => setPicking(null)}
        />
      )}
      {notice && <Toast key={notice.seq}>{notice.text}</Toast>}
    </>
  );
}
