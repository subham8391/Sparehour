// The browser preview of the first run (npm run preview, /welcome): the real views, made-up data. `?step=hours`
// (the start), `calendar` or `dump` picks the step; `?state=` picks what is shown: hours `split` | `failed`; calendar
// `outlook` | `both` | `denied`; dump `some` | `plenty`. "That's right" and Skip move on to the next step; nothing
// is saved anywhere. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import type { TaskDraft } from "@/core/quickadd";
import { Temporal, localDate } from "@/core/time";
import { brainDumpDraft, type Segment } from "@/features/welcome/welcome-rules";
import { BrainDumpView, type Added } from "~/screens/welcome/brain-dump-view";
import { CalendarStepView } from "~/screens/welcome/calendar-step-view";
import { HoursStepView } from "~/screens/welcome/hours-step-view";

const TODAY = localDate("2026-11-21");
const NINE_TO_SIX: Segment = { start: "09:00", end: "18:00" };
const WEEK: Segment[][] = [[NINE_TO_SIX], [NINE_TO_SIX], [NINE_TO_SIX], [NINE_TO_SIX], [NINE_TO_SIX], [], []];
const SPLIT: Segment[][] = [[{ start: "09:00", end: "12:30" }, { start: "13:30", end: "18:00" }], [NINE_TO_SIX], [NINE_TO_SIX], [], [NINE_TO_SIX], [], []];
const draft = (title: string, over: Partial<TaskDraft> = {}) => ({ title, doDate: TODAY, doTime: null, evening: false, estimateMin: null, deadline: null, startDate: null, recurrenceRule: null, projectName: null, tagNames: [], priority: 0, notes: null, ...over }) as unknown as TaskDraft;
const SOME: Added[] = [
  { id: "t1", draft: draft("Draft the proposal", { estimateMin: 45 }) },
  { id: "t2", draft: draft("Call the plumber", { doDate: TODAY.add({ days: 6 }) }) },
  { id: "t3", draft: draft("Review PRs", { estimateMin: 60, projectName: "work" }) },
];
const PLENTY: Added[] = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, draft: draft(`Thing ${i + 1}`) }));
const said = (what: string) => () => console.log(`[preview] ${what}`);

export default function Preview() {
  const q = useLocalSearchParams<{ step?: string; state?: string }>();
  const [step, setStep] = useState(q.step === "calendar" || q.step === "dump" ? q.step : "hours");
  const [added, setAdded] = useState<Added[]>(q.state === "plenty" ? PLENTY : q.state === "some" ? SOME : []);
  if (step === "hours") return <HoursStepView saved={q.state === "split" ? SPLIT : WEEK} zone="Europe/London" onConfirm={() => setStep("calendar")} failure={q.state === "failed" ? "Couldn't save your hours: try again." : null} />;
  if (step === "calendar") {
    return <CalendarStepView google={q.state !== "outlook"} outlook={q.state === "outlook" || q.state === "both"} outcome={q.state === "denied" ? "denied" : null} onSkip={() => setStep("dump")} onConnect={said("connect")} onPrivacy={said("what we store")} />;
  }
  return (
    <BrainDumpView
      ctx={{ now: Temporal.Instant.from("2026-11-21T10:00:00Z"), zone: "UTC", today: TODAY }}
      projects={[{ id: "p1", name: "Acme launch", area: "Work" }]}
      tags={[{ id: "g1", name: "calls" }]}
      added={added}
      placeholder="Draft the proposal 3pm ~45m"
      onSubmit={async (s) => {
        const id = `n${Date.now()}`;
        setAdded((list) => [...list, { id, draft: brainDumpDraft(s.draft, TODAY, list.length) }]);
        return id;
      }}
      onPasted={(ids) => async () => setAdded((list) => list.filter((a) => !ids.includes(a.id)))}
      onFinish={said("finish")}
    />
  );
}
