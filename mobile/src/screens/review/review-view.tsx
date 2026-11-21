// The review of carried-over tasks as the phone draws it (SCREENS.md §2.3a; the web's is the sheet
// features/rituals/carry-review-sheet.tsx, here a screen of its own): the heading that says how many things are
// waiting, one row per carried task with its four-way answer (Keep · Tomorrow · Someday · Drop, Keep chosen until
// another is), a quiet "Pick a day" for any other day (a month to pick from, which leaves every segment unchosen),
// and two ways out at the bottom edge: Not now and Done. A row at the three-carry ask (§2.3) answers the ask instead,
// two by two: Keep today · Someday · Break it down · Drop. The words and the answers are the web's own
// (features/rituals/carry-review.ts, carry-review-answers.ts). Presentational: the answers are kept here until Done
// hands them over; review.tsx writes them.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatMinutes, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import { DEFAULT_CHOICE, allFromYesterday, reviewLine } from "@/features/rituals/carry-review";
import { REVIEW_ASK_OPTIONS, REVIEW_LABEL, REVIEW_LEAD, REVIEW_OPTIONS, REVIEW_WORDS as WORDS, choiceLabel, chosenSegment, dayLabel, reviewAskLine, type ReviewAskSegment, type ReviewSegment, type SheetChoice } from "@/features/rituals/carry-review-answers";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { MonthCalendar } from "~/ui/month-calendar";
import { Screen } from "~/ui/screen";
import { Segmented } from "~/ui/segmented";
import { Sheet } from "~/ui/sheet";
import { TARGET, font, useColours } from "~/ui/theme";

export interface ReviewViewProps {
  /** The carried-over tasks, in the Carried over section's order. */
  tasks: readonly Task[];
  today: LocalDate;
  /** The account's default estimate, shown with a question mark on a task that has none. */
  defaultEstimateMin: number;
  /** The tasks that show the three-carry ask now (the same two a day as Today's). */
  asks?: ReadonlySet<string>;
  /** The hour's sky behind the header. */
  part?: DayPart;
  /** The answers are being written, or the day stamped: both ways out wait. */
  busy?: boolean;
  /** Done: every row's answer; a row never touched is not in the map and is kept. */
  onDone: (choices: ReadonlyMap<string, SheetChoice>) => void;
  /** Not now: nothing is touched; the day is still recorded as reviewed. */
  onNotNow: () => void;
}

export function ReviewView({ tasks, today, defaultEstimateMin, asks, part, busy = false, onDone, onNotNow }: ReviewViewProps) {
  const c = useColours();
  const insets = useSafeAreaInsets();
  const [choices, setChoices] = useState<ReadonlyMap<string, SheetChoice>>(() => new Map());
  // The row whose month is open.
  const [picking, setPicking] = useState<string | null>(null);
  const choiceOf = (id: string): SheetChoice => choices.get(id) ?? DEFAULT_CHOICE;
  const choose = (id: string, choice: SheetChoice) => setChoices((m) => new Map(m).set(id, choice));
  const pickingTask = picking ? tasks.find((t) => t.id === picking) : undefined;
  const pickedChoice = pickingTask ? choiceOf(pickingTask.id) : null;

  return (
    <View accessibilityLabel={REVIEW_LABEL} style={styles.fill}>
      <View style={styles.fill}>
        {/* No Back in the header: the two ways out are Not now and Done, as on the web's sheet. */}
        <Screen eyebrow={REVIEW_LABEL} title={reviewLine(tasks.length, allFromYesterday(tasks, today))} part={part}>
          <Text style={[styles.lead, { color: c.ink2 }]}>{REVIEW_LEAD}</Text>
          <Card>
            {tasks.map((t, i) => (
              <CardRow key={t.id} first={i === 0}>
                <Row task={t} today={today} defaultEstimateMin={defaultEstimateMin} ask={asks?.has(t.id) ?? false} choice={choiceOf(t.id)} onChoose={(choice) => choose(t.id, choice)} onPick={() => setPicking(t.id)} />
              </CardRow>
            ))}
          </Card>
        </Screen>
      </View>
      <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.paper, paddingBottom: Math.max(12, insets.bottom) }]}>
        <Button variant="quiet" label={WORDS.notNow} disabled={busy} onPress={onNotNow} />
        <Button variant="primary" label={WORDS.done} disabled={busy} onPress={() => onDone(choices)} style={styles.done} />
      </View>
      <Sheet open={Boolean(pickingTask)} title={pickingTask ? dayLabel(pickingTask.title) : undefined} onClose={() => setPicking(null)}>
        {pickingTask ? (
          <MonthCalendar
            value={pickedChoice && typeof pickedChoice === "object" ? pickedChoice.day : null}
            today={today}
            min={today}
            onPick={(day) => {
              choose(pickingTask.id, { day });
              setPicking(null);
            }}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

/**
 * One carried task: the title (two lines), the carry count and the estimate in the quiet run beneath it with
 * "Pick a day" at the far edge (the day itself once one is picked), then the four-way answer at 44 points.
 */
function Row({ task, today, defaultEstimateMin, ask, choice, onChoose, onPick }: { task: Task; today: LocalDate; defaultEstimateMin: number; /** At the three-carry ask: the ask's four answers take the place of the moves. */ ask: boolean; choice: SheetChoice; onChoose: (choice: SheetChoice) => void; onPick: () => void }) {
  const c = useColours();
  const segment = chosenSegment(choice);
  const day = typeof choice === "object" ? formatDay(choice.day, { today }) : null;
  return (
    <View style={styles.row}>
      <Text numberOfLines={2} style={[styles.rowTitle, { color: c.ink }]}>
        {task.title}
      </Text>
      <View style={styles.meta}>
        <View style={styles.facts}>
          {task.carryCount > 1 ? <Text style={[styles.count, { color: c.ink3 }]}>×{task.carryCount}</Text> : null}
          {task.estimateMin ? <Chip label={formatMinutes(task.estimateMin)} /> : <Chip tone="guess" label={`${formatMinutes(defaultEstimateMin)}?`} accessibilityLabel={`No estimate, counted as ${formatMinutes(defaultEstimateMin)}`} />}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={day ? `${dayLabel(task.title)}, ${day}` : `${WORDS.pickDay} for ${task.title}`} onPress={onPick} hitSlop={4} style={styles.pick}>
          <Text style={[styles.pickText, { color: day ? c.ink : c.ink2 }, !day && styles.underlined]}>{day ?? WORDS.pickDay}</Text>
        </Pressable>
      </View>
      {ask ? <Text style={[styles.askLine, { color: c.over }]}>{reviewAskLine(task.carryCount)}</Text> : null}
      {ask ? (
        <AskAnswers label={choiceLabel(task.title)} value={segment} onChange={onChoose} />
      ) : (
        <Segmented<ReviewSegment | "day"> label={choiceLabel(task.title)} options={REVIEW_OPTIONS} value={segment as ReviewSegment | "day"} onChange={(v) => v !== "day" && onChoose(v)} />
      )}
    </View>
  );
}

/** The ask's four answers, two by two: four of these words do not fit one 44-point rail on a phone. A radio group, as the rail is. */
function AskAnswers({ label, value, onChange }: { label: string; value: string; onChange: (value: ReviewAskSegment) => void }) {
  const c = useColours();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.askTrack, { backgroundColor: c.surface2, borderColor: c.line }]}>
      {REVIEW_ASK_OPTIONS.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ checked: on }} onPress={() => !on && onChange(o.value)} style={[styles.askOption, on && { backgroundColor: c.surface, borderColor: c.lineStrong }]}>
            <Text style={[styles.askText, { color: on ? c.ink : c.ink2, fontFamily: on ? font.semibold : font.medium }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  lead: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, paddingHorizontal: 20, marginTop: -8, marginBottom: 16 },
  row: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },
  rowTitle: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  meta: { minHeight: TARGET, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  facts: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  count: { fontFamily: font.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
  pick: { minHeight: TARGET, justifyContent: "center", paddingLeft: 12 },
  pickText: { fontFamily: font.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  underlined: { textDecorationLine: "underline" },
  askLine: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  askTrack: { flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderRadius: 12, padding: 2, gap: 2 },
  askOption: { flexGrow: 1, flexBasis: "48%", minHeight: TARGET, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "transparent" },
  askText: { fontSize: 15 },
  footer: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  done: { flex: 1 },
});
