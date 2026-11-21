// The browser preview of Someday (npm run preview, /someday): the real view, made-up data. `?state=empty` shows
// nothing parked; `?sheet=menu|days|review|reviewed` opens a row's actions or the Review walk. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { SomedayActions, SomedayReview, type PickDay } from "~/screens/someday/someday-sheets";
import { SomedayView } from "~/screens/someday/someday-view";

const task = (id: string, title: string, estimateMin: number | null, more: Partial<Task> = {}) => ({ id, title, estimateMin, carryCount: 0, projectId: null, ...more }) as unknown as Task;
const TODAY = localDate("2026-11-21");
const DAYS: PickDay[] = [
  { day: TODAY, name: "Today", date: "Sat 21" },
  { day: TODAY.add({ days: 1 }), name: "Tomorrow", date: "Sun 22" },
  ...[2, 3, 4, 5, 6].map((n) => ({ day: TODAY.add({ days: n }), name: `${["Mon", "Tue", "Wed", "Thu", "Fri"][n - 2]} ${21 + n}` })),
];
const NAMES = new Map([["p1", "Acme launch"]]);
const nothing = () => undefined;

export default function Preview() {
  const q = useLocalSearchParams<{ state?: string; sheet?: string }>();
  const empty = q.state === "empty";
  const asked = { id: "s1", title: "Renew the passport" };
  return (
    <>
      <SomedayView
        today={TODAY}
        defaultEstimateMin={35}
        empty={empty}
        autoFiled={empty ? [] : [task("s1", "Renew the passport", 30, { projectId: "p1" as Task["projectId"] }), task("s2", "Sort the garage", null)]}
        projects={empty ? [] : [{ projectId: "p1", name: "Acme launch", area: "Work", tasks: [task("s3", "Write the case study", 90, { tags: ["writing"] }), task("s4", "Plan the retro", 45)] }]}
        loose={empty ? [] : [task("s5", "Learn to bake bread", null), task("s6", "Call the old flatmates", 20, { tags: ["calls"] })]}
        projectNames={NAMES}
        autoSomedayDays={30}
        announced={empty ? 0 : 2}
        onReview={nothing}
        onDismiss={nothing}
        onBringAllBack={nothing}
        onComplete={nothing}
        onOpen={nothing}
        onMore={nothing}
      />
      <SomedayActions
        task={q.sheet === "menu" || q.sheet === "days" ? asked : null}
        step={q.sheet === "days" ? "days" : "menu"}
        today={TODAY}
        days={DAYS}
        onToday={nothing}
        onPickADate={nothing}
        onPickDay={nothing}
        onBackToActive={nothing}
        onDrop={nothing}
        onClose={nothing}
      />
      <SomedayReview
        open={q.sheet === "review" || q.sheet === "reviewed"}
        task={q.sheet === "review" ? asked : null}
        position="1 of 2"
        line="Acme launch · Last touched Tue 20 Oct"
        step="ask"
        today={TODAY}
        days={DAYS}
        onKeep={nothing}
        onToday={nothing}
        onPickADate={nothing}
        onPickDay={nothing}
        onDrop={nothing}
        onClose={nothing}
      />
    </>
  );
}
