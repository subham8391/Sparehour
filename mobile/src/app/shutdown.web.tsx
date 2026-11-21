// The browser preview of the evening shutdown (npm run preview, /shutdown): the real view, a made-up day.
// `?step=done|carried|rating|highlight|tomorrow|close` opens on that step; `?state=empty` is a day with nothing
// finished and nothing left over, `?state=over` a tomorrow already over its time, `?state=new` an account with too
// few ratings for the 14-day line; `?part=morning|afternoon|evening|night` picks the sky. Nothing here writes: a tap that would is said in the console. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import { ratingTrend } from "@/features/rituals/rating-trend";
import { SHUTDOWN_STEPS, type CarryChoice, type CarryOutcome, type CarryRow, type ShutdownStep } from "@/features/rituals/shutdown";
import { ShutdownView } from "~/screens/shutdown/shutdown-view";

const TODAY = localDate("2026-11-21");
const task = (id: string, title: string, estimateMin: number | null, carryCount = 0): Task => ({ id, title, estimateMin, carryCount, state: "active", doDate: TODAY, deadline: null, doTime: null, projectId: null }) as unknown as Task;
const DONE = [task("d1", "Write the quarterly report", 95), task("d2", "Call the bank", 15), task("d3", "Take B12 Vit", null), task("d4", "Review the budget with Dana before the planning meeting on Thursday", 60)];
const UNFINISHED = [task("u1", "Chase the invoice", 20, 3), task("u2", "Draft the proposal for the Acme launch", 90), task("u3", "Book the dentist", null, 1), task("u4", "Renew the domain", 10)];
const RATINGS = [4, null, 3, 5, null, null, 2, 4, 4, null, 3, 5, 4].map((r, i) => ({ date: TODAY.subtract({ days: 13 - i }).toString(), day_rating: r }));
const OUTCOME: Record<CarryChoice, CarryOutcome> = { tomorrow: "tomorrow", someday: "someday", drop: "dropped", keep: "kept" };
const said = (what: string) => () => console.log(`[preview] ${what}`);

export default function Preview() {
  const q = useLocalSearchParams<{ step?: string; state?: string; part?: string }>();
  const part = (["morning", "afternoon", "evening", "night"].includes(q.part ?? "") ? q.part : "evening") as DayPart;
  const step = (SHUTDOWN_STEPS as readonly string[]).includes(q.step ?? "") ? (q.step as ShutdownStep) : "done";
  const empty = q.state === "empty";
  const [outcomes, setOutcomes] = useState<Record<string, CarryOutcome>>({ u4: "tomorrow" });
  const [rating, setRating] = useState<number | null>(q.state === "new" ? null : 4);
  const [highlight, setHighlight] = useState(step === "close" ? "Write the quarterly report" : "");
  const unfinished: CarryRow[] = empty ? [] : UNFINISHED.map((t) => ({ task: t, outcome: outcomes[t.id] ?? null }));
  return (
    <ShutdownView
      key={step}
      initialStep={step}
      part={part}
      done={empty ? [] : DONE}
      unfinished={unfinished}
      defaultEstimateMin={35}
      rating={rating}
      trend={q.state === "new" ? null : ratingTrend(TODAY, [...RATINGS, { date: TODAY.toString(), day_rating: rating }])}
      highlight={highlight}
      tomorrow={q.state === "over" ? { spareMin: -40, planned: 6 } : empty ? { spareMin: null, planned: 0 } : { spareMin: 250, planned: 3 }}
      onCarry={(id, to) => setOutcomes((o) => ({ ...o, [id]: OUTCOME[to] }))}
      onCarryAll={() => setOutcomes((o) => Object.fromEntries(UNFINISHED.map((t) => [t.id, o[t.id] ?? "tomorrow"])))}
      onRating={setRating}
      onHighlight={setHighlight}
      onPlanTomorrow={said("plan tomorrow now")}
      onClose={said("close the day")}
      onSkip={said("skip")}
    />
  );
}
