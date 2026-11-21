// Browse on the phone (ANDROID_APP_SPEC.md §10; the web's app/(app)/browse/page.tsx), wired to the phone's own
// database. The tree, its order and its counts are the navigation's own (data/queries/nav.ts), the rows under it are
// the web's (browse-rows.ts), and every write goes through the shared repositories, which record their own undo.
// `/browse?add=area` and `?add=project` open the name field, as on the web. The drawing is browse-view.tsx.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { browseRows, type BrowseRow } from "@/app/(app)/browse/browse-rows";
import { useQuery } from "@/data/powersync";
import { AREAS_SQL, FINISHED_PROJECTS_SQL, PROJECTS_SQL, groupProjects, type AreaRow, type ProjectRow, type ProjectStateRow } from "@/data/queries/nav";
import { AREA_CONTENTS_SQL, deleteAreaNote, moveToArea, placeOf, type OrganiseTarget } from "@/features/projects/organise-place";
import { useAreaRepo, useProjectOrderRepo, useProjectRepo } from "@/features/tasks/use-repos";
import { BrowseView, type Adding } from "./browse-view";
import { OrganiseSheet, type OrganiseStep } from "./organise-sheet";

const SPACE_SQL = `select personal_space_id from users limit 1`;
const NO_CONTENTS_SQL = `select 0 as projects, 0 as tasks where 0`;
const ROWS = browseRows();

export function Browse() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const areaRepo = useAreaRepo();
  const projectRepo = useProjectRepo();
  const projectOrder = useProjectOrderRepo();
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: finished } = useQuery<ProjectStateRow>(FINISHED_PROJECTS_SQL);
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const spaceId = users?.[0]?.personal_space_id ?? null;
  // The navigation's own tree (the web's useNavData reads the same two statements into the same grouping).
  const areas = useMemo(() => groupProjects(areaRows ?? [], projectRows ?? []), [areaRows, projectRows]);

  const [adding, setAdding] = useState<Adding>(null);
  // A form named in the address opens once, then the parameter comes off so it can be asked for again.
  const add = params.add;
  useEffect(() => {
    if (add !== "area" && add !== "project") return;
    setAdding(add);
    router.setParams({ add: undefined });
  }, [add, router]);
  const create = (typed: string) => {
    const name = typed.trim();
    const what = adding;
    setAdding(null);
    if (!name || !spaceId || !what) return;
    if (what === "area") void areaRepo.create(name, { spaceId });
    // A project made here has no area yet; it opens, so its first task can go straight in.
    else void projectRepo.create(name, { spaceId }).then((id) => router.push(`/project/${id}`));
  };

  const [target, setTarget] = useState<OrganiseTarget | null>(null);
  const [step, setStep] = useState<OrganiseStep>("menu");
  const place = target ? placeOf(areas, target) : null;
  const deleting = target?.kind === "area" && step === "delete";
  const { data: contents } = useQuery<{ projects: number; tasks: number }>(deleting ? AREA_CONTENTS_SQL : NO_CONTENTS_SQL, deleting && target ? [target.id] : []);
  const close = () => {
    setTarget(null);
    setStep("menu");
  };
  const nudge = (dir: -1 | 1) => {
    if (!target || !place) return;
    const index = place.index + dir;
    if (index < 0 || index >= place.list.length) return;
    if (target.kind === "area") void areaRepo.move(target.id, index);
    else void projectOrder.move(target.id, { areaId: place.areaId, index });
    close();
  };
  const moveTo = (areaId: string | null) => {
    if (target?.kind !== "project") return;
    const move = moveToArea(areas, place, areaId);
    if (move) void projectOrder.move(target.id, move.to, move.areaName);
    close();
  };
  const remove = () => {
    if (target?.kind !== "area") return;
    void areaRepo.remove(target.id);
    close();
  };
  // Carried over is a section of Today (browse-rows.ts), and Today is a tab: it is switched to, not pushed over this one.
  const openRow = (row: BrowseRow) => (row.href === "/today" ? router.replace("/") : router.push(row.href));

  return (
    <>
      <BrowseView
        areas={areas}
        finished={finished ?? []}
        rows={ROWS}
        adding={adding}
        onSearch={() => router.push("/search")}
        onAddArea={() => setAdding("area")}
        onCreate={create}
        onOpenArea={(id) => router.push(`/area/${id}`)}
        onOpenProject={(id) => router.push(`/project/${id}`)}
        onOrganise={(t) => {
          setStep("menu");
          setTarget(t);
        }}
        onOpenRow={openRow}
      />
      <OrganiseSheet
        target={target}
        step={step}
        canMoveUp={Boolean(place && place.index > 0)}
        canMoveDown={Boolean(place && place.index >= 0 && place.index < place.list.length - 1)}
        areas={areas.filter((g) => !g.loose).map((g) => ({ id: g.id, name: g.name }))}
        areaId={place?.areaId ?? null}
        deleteNote={deleteAreaNote(contents?.[0]?.projects ?? 0, contents?.[0]?.tasks ?? 0)}
        onStep={setStep}
        onNudge={nudge}
        onMoveTo={moveTo}
        onDelete={remove}
        onClose={close}
      />
    </>
  );
}
