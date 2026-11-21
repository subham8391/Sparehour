// The browser preview of an area's page (npm run preview, /area/1): the real view, made-up data. Its sheets open from
// the page itself (the header's ⋯, a row's ⋯); nothing is saved, and the add line does nothing here. `?state=empty|missing` picks the area:
// one with nothing filed in it, or the state for an area that is not on the phone. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { weekProgress } from "@/data/queries/area";
import type { ProjectStateRow } from "@/data/queries/nav";
import { deleteAreaNote } from "@/features/projects/organise-place";
import { cardFigures, projectsWord } from "@/features/projects/page-rules";
import { PreviewRows } from "~/screens/rows/preview-rows";
import { AreaMissingView, AreaView, type AreaCard } from "~/screens/area/area-view";

const TODAY = localDate("2026-11-21");
const nothing = () => undefined;

const card = (id: string, name: string, done_week: number, open_count: number, open_min: number, deadline: AreaCard["deadline"] = null): AreaCard => ({
  id,
  name,
  share: weekProgress(done_week, open_count),
  figures: cardFigures({ done_week, open_count, open_min }),
  deadline,
});
const CARDS: AreaCard[] = [card("p1", "Acme redesign", 3, 9, 840, TODAY.add({ days: 12 })), card("p2", "Quarterly report", 0, 4, 210, TODAY.subtract({ days: 2 })), card("p3", "Hiring", 0, 0, 0)];
const FINISHED: ProjectStateRow[] = [
  { id: "f1", name: "Website", area_id: "a1", state: "done" },
  { id: "f2", name: "Old move", area_id: "a1", state: "archived" },
];
const task = (id: string, title: string, more: Partial<Task> = {}) => ({ id, title, state: "active", estimateMin: null, carryCount: 0, projectId: null, areaId: "a1", doDate: null, doTime: null, deadline: null, startDate: null, sortKey: id, ...more }) as unknown as Task;
const TASKS = [task("t1", "Renew the software licences", { estimateMin: 30, doDate: TODAY.add({ days: 1 }) }), task("t2", "Expenses for October", { tags: ["admin"] }), task("t3", "Ask about the conference", { state: "inbox" })];

export default function Preview() {
  const q = useLocalSearchParams<{ state?: string }>();
  if (q.state === "missing") return <AreaMissingView onBrowse={nothing} />;
  const empty = q.state === "empty";
  return (
    <PreviewRows today={TODAY}>
    <AreaView
      id="a1"
      name="Work"
      today={TODAY}
      defaultEstimateMin={35}
      count={projectsWord(empty ? 0 : CARDS.length)}
      cards={empty ? [] : CARDS}
      finished={empty ? [] : FINISHED}
      tasks={empty ? [] : TASKS}
      deleteNote={empty ? deleteAreaNote(0, 0) : deleteAreaNote(5, 3)}
      onRename={nothing}
      onOpenProject={nothing}
      onAddProject={nothing}
      onAdd={nothing}
      onComplete={nothing}
      onOpen={nothing}
      onMoveTask={nothing}
      onDelete={nothing}
    />
    </PreviewRows>
  );
}
