// The evening shutdown as the phone draws it (SCREENS.md §15 "Responsive": one step per card in the settled order,
// the rating five 44-point targets, the footer's buttons fixed at the bottom; the web's is
// features/rituals/shutdown-flow.tsx): Done today, Carried to tomorrow with an answer for each row, the day's rating
// with its 14-day line, one highlight, tomorrow's first draft, and the closing ledger of facts. Every line, title and
// sum is the web's own (features/rituals/shutdown.ts, shutdown-words.ts). Presentational: the screen feeds it the day
// and does the writes (shutdown.tsx).
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { formatMinutes } from "@/core/time";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import type { RatingTrend } from "@/features/rituals/rating-trend";
import { OUTCOME_LABEL, SHUTDOWN_STEPS, carriedLine, carriedToTomorrow, closingLedger, doneLine, nextStep, previousStep, tomorrowLine, type CarryChoice, type CarryRow, type LedgerRow, type ShutdownStep } from "@/features/rituals/shutdown";
import { CARRY_CHOICE_LABEL, HIGHLIGHT_PICKS, SHUTDOWN_LABELS, SHUTDOWN_TITLES, SHUTDOWN_WORDS as WORDS, carryAnswers, highlightToSave, rateLabel, waitingCount } from "@/features/rituals/shutdown-words";
import { ActionLine } from "~/ui/action-line";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { ChipButton } from "~/ui/chip-button";
import { Icon } from "~/ui/icon";
import { TextField } from "~/ui/text-field";
import { TARGET, font, useColours, type Colours } from "~/ui/theme";
import { RatingSparkline } from "./rating-sparkline";
import { Lead, Note, RitualFooter, RitualFrame } from "./ritual-frame";

export interface ShutdownViewProps {
  done: readonly Task[];
  /** The unfinished tasks as they were when the shutdown opened, each with what has become of it since. */
  unfinished: readonly CarryRow[];
  defaultEstimateMin: number;
  rating: number | null;
  /** The last fourteen days' ratings, once five of them are rated (rating-trend.ts); null before. */
  trend?: RatingTrend | null;
  highlight: string;
  tomorrow: { spareMin: number | null; planned: number };
  onCarry: (id: string, to: CarryChoice) => void;
  /** Moves every row still waiting to tomorrow, as one change with one undo. */
  onCarryAll: () => void;
  onRating: (rating: 1 | 2 | 3 | 4 | 5) => void;
  onHighlight: (text: string) => void;
  onPlanTomorrow: () => void;
  /** "Close the day": the flow is complete. */
  onClose: () => void;
  /** Skip ✕: leave now; everything already changed stays changed. */
  onSkip: () => void;
  /** The hour's sky behind the header. */
  part?: DayPart;
  /** The step it opens on (the browser preview's `?step=`); the first, otherwise. */
  initialStep?: ShutdownStep;
}

/** A task's estimate as its row says it: the account's default with a question mark when it has none. */
const estimateOf = (task: Task, defaultEstimateMin: number): string => (task.estimateMin ? formatMinutes(task.estimateMin) : `${formatMinutes(defaultEstimateMin)}?`);

export function ShutdownView(p: ShutdownViewProps) {
  const c = useColours();
  const [step, setStep] = useState<ShutdownStep>(p.initialStep ?? "done");
  const [highlight, setHighlight] = useState(p.highlight);
  // A highlight saved elsewhere meanwhile (another device, an undo) takes the field's place.
  const [seenHighlight, setSeenHighlight] = useState(p.highlight);
  if (seenHighlight !== p.highlight) {
    setSeenHighlight(p.highlight);
    setHighlight(p.highlight);
  }
  const next = nextStep(step);
  const prev = previousStep(step);
  const stepIndex = SHUTDOWN_STEPS.indexOf(step);

  const commitHighlight = () => {
    const text = highlightToSave(highlight, p.highlight);
    if (text !== null) p.onHighlight(text);
  };
  const goNext = () => {
    if (step === "highlight") commitHighlight();
    if (next) setStep(next);
  };
  // Leaving the highlight by the strip or Back saves it too: a phone has no blur to count on.
  const goTo = (to: ShutdownStep) => {
    if (step === "highlight") commitHighlight();
    setStep(to);
  };

  return (
    <RitualFrame
      eyebrow={`${WORDS.eyebrow} · ${stepIndex + 1} of ${SHUTDOWN_STEPS.length}`}
      title={SHUTDOWN_TITLES[step]}
      steps={{ labels: SHUTDOWN_LABELS, index: stepIndex, onStep: (i) => goTo(SHUTDOWN_STEPS[i]) }}
      part={p.part}
      onSkip={p.onSkip}
      footer={<RitualFooter onBack={() => prev && goTo(prev)} canGoBack={prev !== null} primary={step === "close" ? { label: WORDS.close, onPress: p.onClose } : { label: WORDS.next, onPress: goNext }} />}
    >
      {step === "done" ? (
        <>
          <Lead>{doneLine(p.done, p.defaultEstimateMin)}</Lead>
          {p.done.length > 0 ? (
            <Card>
              {p.done.map((t, i) => (
                <CardRow key={t.id} first={i === 0}>
                  <ActionLine mark="done" title={t.title} detail={estimateOf(t, p.defaultEstimateMin)} />
                </CardRow>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {step === "carried" ? (
        <>
          <Lead>{carriedLine(p.unfinished.length)}</Lead>
          {p.unfinished.length > 0 ? (
            <>
              <Card>
                {p.unfinished.map((row, i) => (
                  <CardRow key={row.task.id} first={i === 0}>
                    <CarryLine row={row} defaultEstimateMin={p.defaultEstimateMin} onCarry={p.onCarry} c={c} />
                  </CardRow>
                ))}
              </Card>
              {waitingCount(p.unfinished) > 0 ? (
                <>
                  <Note>{WORDS.carryNote}</Note>
                  <Button variant="quiet" label={WORDS.carryAll} onPress={p.onCarryAll} style={styles.startQuiet} />
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {step === "rating" ? (
        <>
          <Lead>{WORDS.ratingLead}</Lead>
          <View accessibilityRole="radiogroup" accessibilityLabel={WORDS.ratingGroup} style={styles.ratings}>
            {([1, 2, 3, 4, 5] as const).map((n) => {
              const on = p.rating === n;
              return (
                <Pressable key={n} accessibilityRole="radio" accessibilityLabel={rateLabel(n)} accessibilityState={{ checked: on }} onPress={() => p.onRating(n)} style={[styles.rating, { borderColor: on ? c.ink : c.lineStrong, backgroundColor: on ? c.ink : c.surface }]}>
                  <Text style={[styles.ratingText, { color: on ? c.paper : c.ink }]}>{n}</Text>
                </Pressable>
              );
            })}
          </View>
          {p.trend ? <RatingSparkline trend={p.trend} /> : null}
        </>
      ) : null}

      {step === "highlight" ? (
        <>
          <View style={styles.inset}>
            <TextField accessibilityLabel={WORDS.highlightLabel} placeholder={WORDS.highlightHint} autoFocus value={highlight} onChangeText={setHighlight} onBlur={commitHighlight} onSubmitEditing={goNext} returnKeyType="next" submitBehavior="submit" />
          </View>
          {p.done.length > 0 ? (
            <View style={[styles.inset, styles.picks]}>
              {p.done.slice(0, HIGHLIGHT_PICKS).map((t) => (
                <ChipButton key={t.id} label={t.title} chosen={highlight === t.title} onPress={() => setHighlight(t.title)} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {step === "tomorrow" ? (
        <>
          <Lead>{tomorrowLine(p.tomorrow.spareMin, p.tomorrow.planned)}</Lead>
          <View style={[styles.inset, styles.choices]}>
            <Button label={WORDS.planNow} onPress={p.onPlanTomorrow} />
            <Button variant="quiet" label={WORDS.planMorning} onPress={goNext} />
          </View>
        </>
      ) : null}

      {step === "close" ? (
        <>
          <Lead>{WORDS.closeLead}</Lead>
          <Card>
            {closingLedger({ done: p.done, carried: carriedToTomorrow(p.unfinished), defaultEstimateMin: p.defaultEstimateMin, rating: p.rating, highlight, tomorrow: p.tomorrow }).map((row, i) => (
              <CardRow key={row.label} first={i === 0}>
                <View accessible accessibilityLabel={`${row.label}: ${row.value}`} style={styles.ledger}>
                  <Text style={[styles.ledgerLabel, { color: c.ink2 }]}>{row.label}</Text>
                  <Text style={[styles.ledgerValue, ledgerTone(row, c)]}>{row.value}</Text>
                </View>
              </CardRow>
            ))}
          </Card>
        </>
      ) : null}
    </RitualFrame>
  );
}

/** Tomorrow's colours for spare and over; a fact that is absent ("Not rated") is quiet. Never red. */
function ledgerTone(row: LedgerRow, c: Colours) {
  if (row.tone === "spare") return { color: c.spare, fontFamily: font.semibold };
  if (row.tone === "over") return { color: c.over, fontFamily: font.semibold };
  if (row.tone === "quiet") return { color: c.ink3 };
  return { color: c.ink };
}

/**
 * One unfinished task of step 2: its title, how often it was carried and its estimate, then either its answers
 * (Tomorrow · Someday · Drop · Keep for today, each a 44-point target) or, once answered, what became of it. A row
 * kept for today wrote nothing, so its three moves stay open.
 */
function CarryLine({ row, defaultEstimateMin, onCarry, c }: { row: CarryRow; defaultEstimateMin: number; onCarry: (id: string, to: CarryChoice) => void; c: Colours }) {
  const { task, outcome } = row;
  const answers = carryAnswers(outcome);
  return (
    <View style={styles.carry}>
      <Text numberOfLines={2} style={[styles.carryTitle, { color: c.ink }]}>
        {task.title}
      </Text>
      <View style={styles.carryMeta}>
        {task.carryCount > 0 ? <Text style={[styles.carryCount, { color: c.ink3 }]}>×{task.carryCount}</Text> : null}
        {task.estimateMin ? <Chip label={formatMinutes(task.estimateMin)} /> : <Chip tone="guess" label={`${formatMinutes(defaultEstimateMin)}?`} accessibilityLabel={`No estimate, counted as ${formatMinutes(defaultEstimateMin)}`} />}
        {outcome ? (
          <View testID={`outcome-${task.id}`} style={[styles.outcome, { borderColor: c.line, backgroundColor: c.surface2 }]}>
            <Icon name="check" size={13} color={c.ink2} strokeWidth={2.2} />
            <Text style={[styles.outcomeText, { color: c.ink2 }]}>{OUTCOME_LABEL[outcome]}</Text>
          </View>
        ) : null}
      </View>
      {answers.length > 0 ? (
        <View accessibilityLabel={`Answers for ${task.title}`} style={styles.answers}>
          {answers.map((to) => (
            <Pressable key={to} accessibilityRole="button" accessibilityLabel={`${CARRY_CHOICE_LABEL[to]}: ${task.title}`} onPress={() => onCarry(task.id, to)} style={({ pressed }) => [styles.answer, pressed && { backgroundColor: c.surface2 }]}>
              <Text style={[styles.answerText, { color: c.ink2 }]}>{CARRY_CHOICE_LABEL[to]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inset: { paddingHorizontal: 20 },
  startQuiet: { alignSelf: "flex-start", marginLeft: 8, marginTop: -8 },
  ratings: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20 },
  rating: { width: 52, height: 52, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  ratingText: { fontFamily: font.semibold, fontSize: 18, fontVariant: ["tabular-nums"] },
  picks: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choices: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  ledger: { minHeight: TARGET, flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16, paddingHorizontal: 16, paddingVertical: 11 },
  ledgerLabel: { flexShrink: 0, fontFamily: font.regular, fontSize: 16 },
  ledgerValue: { flex: 1, textAlign: "right", fontFamily: font.medium, fontSize: 16, fontVariant: ["tabular-nums"] },
  carry: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  carryTitle: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  carryMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 },
  carryCount: { fontFamily: font.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
  outcome: { height: 26, flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8 },
  outcomeText: { fontFamily: font.medium, fontSize: 13 },
  answers: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -10, marginTop: 2 },
  answer: { minHeight: TARGET, paddingHorizontal: 10, borderRadius: 10, justifyContent: "center" },
  answerText: { fontFamily: font.semibold, fontSize: 15 },
});
