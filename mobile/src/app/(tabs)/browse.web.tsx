// The browser preview of Browse (npm run preview): the real view, made-up data. `?state=empty|adding` picks what is
// shown and `?sheet=menu|move|delete` opens the organise sheet at that step. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { browseRows } from "@/app/(app)/browse/browse-rows";
import { LOOSE_GROUP_ID, type ProjectGroup, type ProjectStateRow } from "@/data/queries/nav";
import { deleteAreaNote } from "@/features/projects/organise-place";
import { BrowseView } from "~/screens/browse/browse-view";
import { OrganiseSheet, type OrganiseStep } from "~/screens/browse/organise-sheet";

const AREAS: ProjectGroup[] = [
  { id: "a1", name: "Work", projects: [{ id: "p1", name: "Acme launch" }, { id: "p2", name: "Quarterly report" }] },
  { id: "a2", name: "Home", projects: [{ id: "p3", name: "Kitchen" }] },
  { id: "a3", name: "Health", projects: [] },
  { id: LOOSE_GROUP_ID, name: "Projects", projects: [{ id: "p4", name: "Read more" }], loose: true },
];
const FINISHED: ProjectStateRow[] = [
  { id: "f1", name: "Website", area_id: "a1", state: "done" },
  { id: "f2", name: "Old move", area_id: null, state: "archived" },
];
const nothing = () => undefined;

export default function Preview() {
  const q = useLocalSearchParams<{ state?: string; sheet?: string }>();
  const empty = q.state === "empty";
  const step = (["menu", "move", "delete"].includes(q.sheet ?? "") ? q.sheet : null) as OrganiseStep | null;
  return (
    <>
      <BrowseView
        areas={empty ? [] : AREAS}
        finished={empty ? [] : FINISHED}
        rows={browseRows()}
        adding={q.state === "adding" ? "area" : null}
        onSearch={nothing}
        onAddArea={nothing}
        onCreate={nothing}
        onOpenArea={nothing}
        onOpenProject={nothing}
        onOrganise={nothing}
        onOpenRow={nothing}
      />
      <OrganiseSheet
        target={step ? (step === "delete" ? { kind: "area", id: "a1", name: "Work" } : { kind: "project", id: "p2", name: "Quarterly report" }) : null}
        step={step ?? "menu"}
        canMoveUp
        canMoveDown={false}
        areas={AREAS.filter((a) => !a.loose)}
        areaId="a1"
        deleteNote={deleteAreaNote(2, 5)}
        onStep={nothing}
        onNudge={nothing}
        onMoveTo={nothing}
        onDelete={nothing}
        onClose={nothing}
      />
    </>
  );
}
