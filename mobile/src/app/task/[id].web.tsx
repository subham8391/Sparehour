// The browser preview of a task's detail (npm run preview, /task/1): the real view, made-up data. Fields change the
// made-up task in place, so every sheet can be tried; nothing is saved. `?state=plain|repeat|done|missing` picks the
// task: a bare one, one that repeats (a new day asks "just this once or change the rule"), a finished one (Took), or
// the state for a task that is not on the phone. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { instant, localDate, localTime } from "@/core/time";
import type { ChecklistItem, SpaceId, TagRef, Task, TaskId } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import { TaskDetailView, TaskMissingView } from "~/screens/task/task-detail-view";

const TODAY = localDate("2026-11-21");
const NOW = instant("2026-11-21T14:05:00Z");
const nothing = () => undefined;

const BASE: Task = {
  id: "t1" as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: "p1" as Task["projectId"],
  headingId: "h1",
  areaId: null,
  title: "Write the quarterly report for the board",
  notes: "Numbers are in the **Q3 sheet**.\n\n- ask Dana for the hiring slide\n- keep it to four pages",
  state: "active",
  priority: 3,
  doDate: TODAY,
  doTime: localTime("15:00"),
  deadline: TODAY.add({ days: 6 }),
  startDate: null,
  evening: false,
  estimateMin: 90,
  carryCount: 3,
  lastCarriedAt: TODAY.subtract({ days: 1 }),
  lastTouchedAt: NOW,
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: null,
  routineRunId: null,
};
const PLAIN: Task = { ...BASE, projectId: null, headingId: null, title: "Call the bank", notes: null, priority: 0, doDate: null, doTime: null, deadline: null, estimateMin: null, carryCount: 0, lastCarriedAt: null };
const REPEAT: Task = { ...BASE, title: "Review the budget", doTime: null, deadline: null, carryCount: 0, lastCarriedAt: null, recurrenceRule: "FREQ=WEEKLY;BYDAY=SA", recurrenceMode: "fixed", missPolicy: "skip" };
const DONE: Task = { ...BASE, state: "done", carryCount: 0, lastCarriedAt: null };

const STEPS: ChecklistItem[] = [
  { id: "c1", taskId: BASE.id, title: "Pull last quarter's numbers", done: true, sortKey: "a0" },
  { id: "c2", taskId: BASE.id, title: "Outline", done: true, sortKey: "a1" },
  { id: "c3", taskId: BASE.id, title: "Draft", done: false, sortKey: "a2" },
  { id: "c4", taskId: BASE.id, title: "Send to Dana", done: false, sortKey: "a3" },
];
const ALL_TAGS: TagRef[] = [
  { id: "g1", name: "deep" },
  { id: "g2", name: "writing" },
  { id: "g3", name: "calls" },
  { id: "g4", name: "errands" },
];

export default function Preview() {
  const q = useLocalSearchParams<{ state?: string }>();
  const first = q.state === "plain" ? PLAIN : q.state === "repeat" ? REPEAT : q.state === "done" ? DONE : BASE;
  const [task, setTask] = useState(first);
  const [steps, setSteps] = useState(q.state === "plain" ? [] : STEPS);
  const [tags, setTags] = useState<TagRef[]>(q.state === "plain" ? [] : [ALL_TAGS[0]]);
  const [took, setTook] = useState<number | null>(null);
  if (q.state === "missing") return <TaskMissingView onBack={nothing} />;
  const patch = (p: TaskPatch) => setTask((t) => ({ ...t, ...p, ...(p.projectId !== undefined ? { areaId: null } : {}), ...(p.areaId ? { projectId: null, headingId: null } : {}) }) as Task);
  const project = task.projectId ? "Acme launch" : null;
  return (
    <TaskDetailView
      task={task}
      projectName={project}
      areaName={project ? "Work" : task.areaId ? "Home" : null}
      projects={[
        { id: "p1", name: "Acme launch", area: "Work" },
        { id: "p2", name: "Website", area: "Work" },
        { id: "p3", name: "Website", area: "Home" },
      ]}
      areas={[
        { id: "a1", name: "Work" },
        { id: "a2", name: "Home" },
      ]}
      headings={[
        { id: "h1", title: "Writing" },
        { id: "h2", title: "Review" },
      ]}
      onHeading={(headingId) => setTask((t) => ({ ...t, headingId }))}
      checklist={steps}
      tags={tags}
      allTags={ALL_TAGS}
      now={NOW}
      zone="Europe/London"
      today={TODAY}
      defaultEstimateMin={35}
      usual={task.state === "done" ? null : 120}
      took={took}
      onTook={setTook}
      onPatch={patch}
      onComplete={() => setTask((t) => ({ ...t, state: "done" }))}
      onReopen={() => setTask((t) => ({ ...t, state: "active" }))}
      onSomeday={nothing}
      onDrop={nothing}
      onConvert={nothing}
      onDuplicate={nothing}
      onChecklistAdd={(title) => setSteps((s) => [...s, { id: `c${s.length + 10}`, taskId: BASE.id, title, done: false, sortKey: `b${s.length}` }])}
      onChecklistToggle={(id, done) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, done } : x)))}
      onChecklistRename={(id, title) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, title } : x)))}
      onChecklistRemove={(id) => setSteps((s) => s.filter((x) => x.id !== id))}
      onChecklistReorder={(id, sortKey) => setSteps((s) => s.map((x) => (x.id === id ? { ...x, sortKey } : x)).sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1)))}
      onTagAdd={(name) => setTags((t) => (t.some((x) => x.name === name) ? t : [...t, ALL_TAGS.find((x) => x.name === name) ?? { id: `new-${name}`, name }]))}
      onTagRemove={(id) => setTags((t) => t.filter((x) => x.id !== id))}
      onSeriesDay={(_choice, change) => patch(change)}
      onChangeRule={(rule, mode) => patch({ recurrenceRule: rule, recurrenceMode: mode })}
      onSkipOccurrence={nothing}
      onPause={(until) => setTask((t) => ({ ...t, recurrencePausedUntil: until }))}
      onResume={() => setTask((t) => ({ ...t, recurrencePausedUntil: null }))}
    />
  );
}
