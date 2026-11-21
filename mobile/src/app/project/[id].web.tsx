// The browser preview of a project's page (npm run preview, /project/1): the real view, made-up data. Its sheets open
// from the page itself (the header's ⋯, a row's ⋯, a heading's ⋯, Deadline); nothing is saved, and an add line does
// nothing here (the add sheet is its screen's).
// `?state=empty|done|missing` picks the project: one with nothing in it, a completed one, or the state for a project
// that is not on the phone. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { instant, localDate } from "@/core/time";
import type { Heading, Project, Task } from "@/core/types";
import type { HeadingGroup } from "@/features/projects/organise";
import { projectActions, summaryWords } from "@/features/projects/page-rules";
import { snoozePresets } from "@/features/tasks/snooze";
import { ProjectMissingView, ProjectView } from "~/screens/project/project-view";

const TODAY = localDate("2026-11-21");
const NOW = instant("2026-11-21T14:05:00Z");
const ZONE = "Europe/London";
const nothing = () => undefined;

const PROJECT = { id: "p1", spaceId: "s1", areaId: "a1", name: "Acme redesign", notes: "Scope is in the **brief**.\n\n- keep the old URLs\n- launch before the holidays", state: "active", deadline: TODAY.add({ days: 12 }), sortKey: "a0" } as unknown as Project;
const heading = (id: string, title: string, sortKey: string) => ({ id, projectId: "p1", title, sortKey }) as unknown as Heading;
const task = (id: string, title: string, more: Partial<Task> = {}) => ({ id, title, state: "active", estimateMin: null, carryCount: 0, projectId: "p1", headingId: null, doDate: null, doTime: null, deadline: null, startDate: null, sortKey: id, ...more }) as unknown as Task;

const RESEARCH = heading("h1", "Research", "a0");
const BUILD = heading("h2", "Build", "a1");
const GROUPS: HeadingGroup[] = [
  { heading: null, tasks: [task("t1", "Agree the scope with Dana", { estimateMin: 30, doDate: TODAY }), task("t2", "Book the kickoff", { state: "inbox" })] },
  { heading: RESEARCH, tasks: [task("t3", "Write up the findings", { estimateMin: 120, doDate: TODAY.add({ days: 2 }), tags: ["writing"] })] },
  { heading: BUILD, tasks: [task("t4", "Component pass", { estimateMin: 240, deadline: TODAY.add({ days: 6 }) }), task("t5", "Wire up the API", { estimateMin: 180, startDate: TODAY.add({ days: 9 }) })] },
];
const DONE = new Map<string, Task[]>([["h1", [task("d1", "Interview 3 users", { state: "done", headingId: "h1" })]]]);
const SOMEDAY = [task("s1", "Dark mode", { state: "someday" }), task("s2", "A changelog page", { state: "someday", estimateMin: 60 })];

export default function Preview() {
  const q = useLocalSearchParams<{ state?: string }>();
  if (q.state === "missing") return <ProjectMissingView onBrowse={nothing} />;
  const empty = q.state === "empty";
  const project = { ...PROJECT, ...(q.state === "done" ? { state: "done" } : {}), ...(empty ? { notes: null, deadline: null } : {}) } as Project;
  return (
    <ProjectView
      project={project}
      area={{ id: "a1", name: "Work" }}
      today={TODAY}
      now={NOW}
      zone={ZONE}
      defaultEstimateMin={35}
      summary={summaryWords(empty ? { open: 0, minutes: 0 } : { open: 5, minutes: 640 })}
      empty={empty}
      groups={empty ? [{ heading: null, tasks: [] }] : GROUPS}
      done={empty ? new Map() : DONE}
      someday={empty ? [] : SOMEDAY}
      actions={projectActions(project.state)}
      areas={[
        { id: "a1", name: "Work" },
        { id: "a2", name: "Home" },
      ]}
      presets={snoozePresets(NOW, ZONE, TODAY)}
      onRename={nothing}
      onNotes={nothing}
      onDeadline={nothing}
      onOpenArea={nothing}
      onAction={nothing}
      onMoveToArea={nothing}
      onAdd={nothing}
      onComplete={nothing}
      onOpen={nothing}
      onMoveTask={nothing}
      onTaskHeading={nothing}
      onToday={nothing}
      onSnooze={nothing}
      onSomeday={nothing}
      onAddHeading={nothing}
      onRenameHeading={nothing}
      onMoveHeading={nothing}
      onRemoveHeading={nothing}
    />
  );
}
