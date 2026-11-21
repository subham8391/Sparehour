// The morning plan as the phone draws it (SCREENS.md §14; the web's is features/rituals/morning-plan-flow.tsx at
// phone width): three steps, one spare number, and an always-available Skip. The header carries the count
// ("Morning plan · 2 of 3"), the step's title and Skip; the numbered strip under it goes to any step; Back and the
// step's one action hold the bottom edge. Step 1 only frames the day; step 2 is the picker, its capacity summary
// staying under the top edge with the Easiest move under it; step 3 is the day's timeline with tap-to-schedule, and
// Plan my day's preview in the step. Presentational: it is handed the day and says what was chosen, so it is drawn
// with fixtures in the browser preview and in tests, and with the real day by plan.tsx, which does the writes as
// choices are made. The steps, the readout, the easiest move and every sentence are the web's own (morning-plan.ts,
// morning-plan-words.ts).
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import type { Capacity } from "@/core/capacity";
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import { PLAN_STEPS, easiestMove, readout, type Candidates, type PlanStep } from "@/features/rituals/morning-plan";
import { FRAME_LEAD, PLAN_STEP_LABELS, PLAN_TITLES, eveningNote, primaryLabel, toBlockTasks } from "@/features/rituals/morning-plan-words";
import { IconButton, Screen } from "~/ui/screen";
import { StickyScreen } from "~/ui/sticky-screen";
import { font, useColours } from "~/ui/theme";
import type { RibbonShape } from "../today/ribbon-shape";
import { BlockStep, type BlockingStep, type PlanMyDayStep } from "./block-step";
import { CoachCard, PickStep, PickSummary, type CarryTo } from "./pick-step";
import { PlanFooter, StepStrip } from "./plan-frame";
import { PlanHero } from "./plan-hero";

export interface MorningPlanViewProps {
  /** The hour's sky. */
  part?: DayPart;
  capacity: Capacity | null;
  /** The working day as the ribbon draws it (ribbonShape); null on a day without working hours. */
  ribbon: RibbonShape | null;
  /** Time already blocked out today, so step 3 lists only what still wants a time. */
  blocks?: readonly { taskId: string | null }[];
  /** The picker's groups, frozen when the flow opened so rows do not jump as choices are made. */
  groups: Candidates;
  /** Tasks currently on today (picked), including ones ticked during this flow. */
  onToday: readonly Task[];
  fitsMin: number;
  tomorrowSpareMin: number | null;
  /** When This evening's own time starts (the end of the working day), for step 2's note; null leaves the time unnamed. */
  eveningStartMin?: number | null;
  defaultEstimateMin: number;
  /** The carried tasks that show the three-carry ask now: Today's two a day. */
  asks: ReadonlySet<string>;
  today: LocalDate;
  /** The step the flow opens on; the first, unless the preview asks for another. */
  initialStep?: PlanStep;
  /** "Break it down": converts the task into a project and opens it. */
  onBreakDown?: (id: string) => void;
  /** Step 2, where the asks are, is on screen: they can be recorded as shown. */
  onAsksShown?: () => void;
  onPick: (task: Task, picked: boolean) => void;
  onCarry: (id: string, to: CarryTo) => void;
  onMoveToTomorrow: (id: string) => void;
  /** A new estimate from the row's chip: the readout follows at once. */
  onEstimate?: (id: string, minutes: number) => void;
  onDone: () => void;
  onSkip: () => void;
  /** Plan my day inside the last step: the button, and the open preview. */
  planMyDay?: PlanMyDayStep;
  /** Step 3's time blocking: the day's timeline and tap-to-schedule. */
  blocking?: BlockingStep;
}

export function MorningPlanView(p: MorningPlanViewProps) {
  const c = useColours();
  const [step, setStep] = useState<PlanStep>(p.initialStep ?? "frame");
  const [showAll, setShowAll] = useState(false);
  const [keptAnyway, setKeptAnyway] = useState<string | null>(null);
  const index = PLAN_STEPS.indexOf(step);
  const picked = new Set(p.onToday.map((t) => t.id));
  const r = readout(p.onToday, p.fitsMin, p.defaultEstimateMin);
  const move = easiestMove(p.onToday, r.overMin, p.tomorrowSpareMin, p.defaultEstimateMin);
  const coachMove = move && keptAnyway !== move.task.id ? move : null;
  const cap = p.capacity;
  // A plan asked for opens on the last step, wherever the flow is.
  const planOpen = Boolean(p.planMyDay?.open);
  const [sawPlanOpen, setSawPlanOpen] = useState(false);
  if (planOpen !== sawPlanOpen) {
    setSawPlanOpen(planOpen);
    if (planOpen) setStep("block");
  }
  const onAsksShown = p.onAsksShown;
  useEffect(() => {
    if (step === "pick") onAsksShown?.();
  }, [step, onAsksShown]);

  const next = () => index < PLAN_STEPS.length - 1 && setStep(PLAN_STEPS[index + 1]);
  const head = {
    eyebrow: `Morning plan · ${index + 1} of ${PLAN_STEPS.length}`,
    title: PLAN_TITLES[step],
    part: p.part,
    actions: <IconButton icon="close" label="Skip" onPress={p.onSkip} />,
  };
  const strip = <StepStrip labels={PLAN_STEP_LABELS} index={index} onStep={(i) => setStep(PLAN_STEPS[i])} />;

  return (
    <View style={styles.fill}>
      <View style={styles.fill}>
        {step === "frame" ? (
          <Screen {...head}>
            {strip}
            <PlanHero capacity={cap} ribbon={p.ribbon} carried={p.groups.carried.length} />
            <Text style={[styles.lead, { color: c.ink2 }]}>{FRAME_LEAD}</Text>
          </Screen>
        ) : step === "pick" ? (
          // The summary stays under the top edge while the groups pass beneath it; the Easiest move scrolls with them.
          <StickyScreen {...head} before={strip} sticky={<PickSummary r={r} />}>
            {coachMove ? <CoachCard move={coachMove} defaultEstimateMin={p.defaultEstimateMin} onMove={() => p.onMoveToTomorrow(coachMove.task.id)} onKeep={() => setKeptAnyway(coachMove.task.id)} /> : null}
            <PickStep
              groups={p.groups}
              picked={picked}
              today={p.today}
              defaultEstimateMin={p.defaultEstimateMin}
              asks={p.asks}
              eveningNote={eveningNote(p.onToday, p.defaultEstimateMin, p.eveningStartMin ?? null)}
              showAll={showAll}
              onShowAll={() => setShowAll(true)}
              onPick={p.onPick}
              onCarry={p.onCarry}
              onBreakDown={p.onBreakDown}
              onEstimate={p.onEstimate}
            />
          </StickyScreen>
        ) : (
          // The hours scroll by themselves, under the step's own list.
          <Screen {...head} scroll={false}>
            {strip}
            <BlockStep
              hasDay={Boolean(cap && cap.state !== "no_work_day")}
              spareMin={cap && cap.state !== "no_work_day" ? cap.spareMin : 0}
              toBlock={toBlockTasks(p.onToday, p.blocks ?? [])}
              defaultEstimateMin={p.defaultEstimateMin}
              planMyDay={p.planMyDay}
              blocking={p.blocking}
            />
          </Screen>
        )}
      </View>
      <PlanFooter onBack={() => index > 0 && setStep(PLAN_STEPS[index - 1])} canGoBack={index > 0} primary={{ label: primaryLabel(step), onPress: step === "block" ? p.onDone : next }} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  lead: { marginHorizontal: 20, marginTop: 16, fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
});
