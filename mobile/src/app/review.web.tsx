// The browser preview of the review of carried-over tasks (npm run preview, /review): the real view, a made-up pile.
// `?state=yesterday` is a pile that is all yesterday's (the heading says so), `?state=one` a single task,
// `?state=ask` puts two rows at the three-carry ask, `?state=busy` is the moment after Done. Nothing here writes:
// what Done would hand over is said in the console. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { ReviewView } from "~/screens/review/review-view";

const TODAY = localDate("2026-11-21");
const task = (id: string, title: string, daysAgo: number, estimateMin: number | null, carryCount: number): Task => ({ id, title, estimateMin, carryCount, state: "active", doDate: TODAY.subtract({ days: daysAgo }), deadline: null, doTime: null, projectId: null }) as unknown as Task;
const PILE = [
  task("c1", "Chase the invoice from the printers before the end of the quarter", 6, 20, 4),
  task("c2", "Draft the proposal", 3, 90, 3),
  task("c3", "Book the dentist", 2, null, 2),
  task("c4", "Renew the domain", 1, 10, 1),
  task("c5", "Reply to Dana about Thursday", 1, null, 1),
];

export default function Preview() {
  const q = useLocalSearchParams<{ state?: string }>();
  const tasks = q.state === "one" ? PILE.slice(3, 4) : q.state === "yesterday" ? PILE.slice(3) : PILE;
  return (
    <ReviewView
      tasks={tasks}
      today={TODAY}
      defaultEstimateMin={35}
      asks={q.state === "ask" ? new Set(["c1", "c2"]) : undefined}
      busy={q.state === "busy"}
      onDone={(choices) => console.log("[preview] done", [...choices].map(([id, choice]) => `${id}: ${typeof choice === "object" ? choice.day.toString() : choice}`))}
      onNotNow={() => console.log("[preview] not now")}
    />
  );
}
