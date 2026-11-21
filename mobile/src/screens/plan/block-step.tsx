// The morning plan's last step on the phone (SCREENS.md §14 step 3 and "Responsive"; the web's is features/rituals/
// morning-plan-flow.tsx): Plan my day's button or its open preview, the spare figure that follows every block placed,
// the picked daytime tasks still without a time, and under them the day's timeline, which is Today's own. The phone
// blocks by tap: a task (or its Block), then a time; while one waits, the list steps aside so the hours have the
// screen, and the timeline's own bar says what it waits for, with Cancel. Presentational: the timeline is handed in.
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { formatMinutes } from "@/core/time";
import type { Task } from "@/core/types";
import { NO_HOURS_LINE, PLAN_MY_DAY_LEAD, spareFigure, toBlockWords } from "@/features/rituals/morning-plan-words";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { SectionLabel } from "~/ui/section-label";
import { font, useColours } from "~/ui/theme";

export interface PlanMyDayStep {
  open: boolean;
  onOpen: () => void;
  /** The preview, shown in the button's place while open. */
  preview: ReactNode;
}

export interface BlockingStep {
  /** The day's timeline, with the placing behind every tap (today/day-pane.tsx). */
  dayPane: ReactNode;
  /** A task is waiting for a tap on the timeline. */
  placing: boolean;
  /** A task (or its Block) tapped: the next tap on the timeline places it. */
  onPlace: (taskId: string) => void;
}

export interface BlockStepProps {
  /** False on a day without working hours: there is no timeline to block on. */
  hasDay: boolean;
  /** The day's spare minutes now (negative when over). */
  spareMin: number;
  /** The picked daytime tasks that have no block yet. */
  toBlock: readonly Task[];
  defaultEstimateMin: number;
  planMyDay?: PlanMyDayStep;
  blocking?: BlockingStep;
}

/** The sentence under the step's title. The phone has no drag and no keys, so it names the tap. */
export function blockLead(blocking: boolean, planMyDay: boolean): string {
  return `${blocking ? "Tap a task and then a time on your day." : "Your day as it stands."}${planMyDay ? ` ${PLAN_MY_DAY_LEAD}` : ""}`;
}

export function BlockStep({ hasDay, spareMin, toBlock, defaultEstimateMin, planMyDay, blocking }: BlockStepProps) {
  const c = useColours();
  const lead = <Text style={[styles.lead, { color: c.ink2 }]}>{blockLead(Boolean(blocking), Boolean(planMyDay))}</Text>;
  if (!hasDay) {
    return (
      <View>
        {lead}
        <Text style={[styles.lead, styles.none, { color: c.ink3 }]}>{NO_HOURS_LINE}</Text>
      </View>
    );
  }
  const waiting = Boolean(blocking?.placing);
  return (
    <View style={styles.fill}>
      {/* While a task waits for a time the hours have the whole step; the timeline's own bar says what it waits for. */}
      {waiting ? null : (
        <ScrollView testID="block-step-top" style={[styles.top, blocking ? (planMyDay?.open ? styles.topOpen : styles.topShut) : null]} contentContainerStyle={styles.topBody} keyboardShouldPersistTaps="handled">
          {lead}
          {planMyDay && !planMyDay.open ? (
            <View style={styles.planButton}>
              <Button variant="secondary" label="Plan my day" onPress={planMyDay.onOpen} />
            </View>
          ) : null}
          {planMyDay?.open ? planMyDay.preview : null}
          {/* The spare figure follows every block placed. */}
          <Text accessibilityLiveRegion="polite" style={[styles.spare, { color: spareMin < 0 ? c.over : c.ink }]}>
            {spareFigure(spareMin)}
            <Text style={[styles.spareRest, { color: c.ink2 }]}> · {toBlockWords(toBlock.length)}</Text>
          </Text>
          {blocking && toBlock.length > 0 ? (
            <View accessibilityLabel="To block">
              <SectionLabel label="To block" count={toBlock.length} />
              <Card>
                {toBlock.map((t, i) => (
                  <CardRow key={t.id} first={i === 0}>
                    <View style={styles.row}>
                      <Pressable accessibilityRole="button" accessibilityLabel={t.title} accessibilityHint="Then tap a time on your day" onPress={() => blocking.onPlace(t.id)} style={styles.rowTitle}>
                        <Text numberOfLines={2} style={[styles.title, { color: c.ink }]}>
                          {t.title}
                        </Text>
                      </Pressable>
                      <Chip tone={t.estimateMin ? "neutral" : "guess"} label={`${formatMinutes(t.estimateMin ?? defaultEstimateMin)}${t.estimateMin == null ? "?" : ""}`} />
                      <Button variant="quiet" label="Block" accessibilityLabel={`Block ${t.title}`} onPress={() => blocking.onPlace(t.id)} />
                    </View>
                  </CardRow>
                ))}
              </Card>
            </View>
          ) : null}
        </ScrollView>
      )}
      {blocking ? <View style={styles.fill}>{blocking.dayPane}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // The list keeps to its share, so the hours under it always have room; it scrolls inside that.
  top: { flexGrow: 0 },
  topShut: { maxHeight: "46%" },
  topOpen: { maxHeight: "62%" },
  topBody: { paddingBottom: 8 },
  lead: { marginHorizontal: 20, fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  none: { marginTop: 12 },
  planButton: { marginHorizontal: 16, marginTop: 12, alignItems: "flex-start" },
  spare: { marginHorizontal: 20, marginTop: 12, fontFamily: font.semibold, fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] },
  spareRest: { fontFamily: font.regular },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 4 },
  rowTitle: { flex: 1, minHeight: 56, justifyContent: "center", paddingVertical: 8 },
  title: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
});
