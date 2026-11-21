// The morning plan's picker on the phone (SCREENS.md §14 step 2 and "Responsive"; the web's is features/rituals/
// morning-plan-flow.tsx at phone width): the capacity summary that stays at the top (in the over colour when over),
// the Easiest move under it, then the three groups, each folding under a 44-point header with its count. A row is
// the tick (and the title, which ticks too), then under the title where the task waits, its deadline, how often it
// was carried and its estimate, which opens the presets. A carried row keeps its four moves behind "More actions",
// or shows the gentle ask in their place. Presentational: every tick, move and estimate is said to whoever mounts it.
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { compareDates, formatMinutes, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import type { EasiestMove } from "@/features/rituals/easiest-move";
import type { Candidates, Readout } from "@/features/rituals/morning-plan";
import { PICK_LEAD, PLAN_ESTIMATES, PROJECTS_SHOWN, overLead, pickSummary } from "@/features/rituals/morning-plan-words";
import { dayChip } from "@/features/tasks/day-chip";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { CheckBox } from "~/ui/check-box";
import { Chip } from "~/ui/chip";
import { Disclosure } from "~/ui/disclosure";
import { MenuRow } from "~/ui/menu-row";
import { RowMore } from "~/ui/nav-row";
import { Sheet } from "~/ui/sheet";
import { TARGET, font, useColours } from "~/ui/theme";
import { RowMenuSheet } from "../today/menus";

export type CarryTo = "today" | "tomorrow" | "someday" | "drop";

export interface PickStepProps {
  groups: Candidates;
  /** The ids of the tasks on today now: ticked. */
  picked: ReadonlySet<string>;
  today: LocalDate;
  defaultEstimateMin: number;
  /** The carried tasks that show the three-carry ask now. */
  asks: ReadonlySet<string>;
  /** Step 2's note about the evening's own time. */
  eveningNote: string;
  /** "From your projects" in full, once More was pressed; held by the flow, so it holds while the steps are walked. */
  showAll: boolean;
  onShowAll: () => void;
  onPick: (task: Task, picked: boolean) => void;
  onCarry: (id: string, to: CarryTo) => void;
  onBreakDown?: (id: string) => void;
  onEstimate?: (id: string, minutes: number) => void;
}

/** The summary that stays under the top edge: "40m over · 5h 40m fits today · 6h 20m picked · 7 tasks". */
export function PickSummary({ r }: { r: Readout }) {
  const c = useColours();
  const over = r.overMin > 0;
  return (
    // The one live readout: read out on every tick and estimate, in full, with the coach's sentence when over.
    <View
      testID="plan-summary"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${r.line}${r.coach ? ` ${r.coach}` : ""}`}
      style={[styles.summary, over ? { backgroundColor: c.overSoft, borderColor: c.overFill } : { backgroundColor: c.surface, borderColor: c.line }]}
    >
      <Text style={[styles.summaryText, { color: over ? c.over : c.ink }]}>
        {overLead(r)}
        {pickSummary(r)}
      </Text>
    </View>
  );
}

/** The Easiest move, under the summary when the day is over: the task, the reason, and the two answers. */
export function CoachCard({ move, defaultEstimateMin, onMove, onKeep }: { move: EasiestMove; defaultEstimateMin: number; onMove: () => void; onKeep: () => void }) {
  const c = useColours();
  return (
    <View testID="plan-coach" style={[styles.coach, { backgroundColor: c.overSoft, borderColor: c.overFill }]}>
      <Text style={[styles.coachHead, { color: c.ink }]}>
        <Text style={styles.medium}>Easiest move</Text> · {move.task.title} · {formatMinutes(move.task.estimateMin ?? defaultEstimateMin)}
        {move.task.estimateMin == null ? "?" : ""}
      </Text>
      <Text style={[styles.coachReason, { color: c.ink2 }]}>{move.reason}</Text>
      <View style={styles.coachActions}>
        <Button variant="primary" label="Move to tomorrow" onPress={onMove} />
        <Button variant="quiet" label="Keep it anyway" onPress={onKeep} />
      </View>
    </View>
  );
}

export function PickStep(p: PickStepProps) {
  const c = useColours();
  // The row whose estimate presets are open, and the carried row whose "More actions" is.
  const [estimating, setEstimating] = useState<Task | null>(null);
  const [menu, setMenu] = useState<Task | null>(null);
  const projects = p.showAll ? p.groups.fromProjects : p.groups.fromProjects.slice(0, PROJECTS_SHOWN);
  const row = (task: Task, i: number, carried = false) => {
    // The ask takes the place of the four moves, as on Today.
    const asking = carried && p.asks.has(task.id) && !p.picked.has(task.id);
    return (
      <CardRow key={task.id} first={i === 0}>
        <PickRow
          task={task}
          picked={p.picked.has(task.id)}
          today={p.today}
          defaultEstimateMin={p.defaultEstimateMin}
          onPick={p.onPick}
          onEstimate={p.onEstimate ? () => setEstimating(task) : undefined}
          onMore={carried && !asking ? () => setMenu(task) : undefined}
        />
        {asking ? (
          <CarryAsk
            count={task.carryCount}
            onKeep={() => p.onCarry(task.id, "today")}
            onSomeday={() => p.onCarry(task.id, "someday")}
            onBreakDown={p.onBreakDown ? () => p.onBreakDown?.(task.id) : undefined}
            onDrop={() => p.onCarry(task.id, "drop")}
          />
        ) : null}
      </CardRow>
    );
  };
  return (
    <>
      <Text style={[styles.lead, { color: c.ink2 }]}>{PICK_LEAD}</Text>
      <Group title="Carried over" count={p.groups.carried.length}>
        {p.groups.carried.map((t, i) => row(t, i, true))}
      </Group>
      <Group title="Due this week" count={p.groups.dueThisWeek.length}>
        {p.groups.dueThisWeek.map((t, i) => row(t, i))}
      </Group>
      <Group title="From your projects" count={p.groups.fromProjects.length}>
        {projects.map((t, i) => row(t, i))}
        {!p.showAll && p.groups.fromProjects.length > PROJECTS_SHOWN ? (
          <CardRow>
            <Pressable accessibilityRole="button" accessibilityLabel={`More · ${p.groups.fromProjects.length - PROJECTS_SHOWN}`} onPress={p.onShowAll} style={styles.more}>
              <Text style={[styles.moreText, { color: c.ink2 }]}>More · {p.groups.fromProjects.length - PROJECTS_SHOWN}</Text>
            </Pressable>
          </CardRow>
        ) : null}
      </Group>
      <Text style={[styles.note, { color: c.ink3 }]}>{p.eveningNote}</Text>

      {/* The estimate presets, in place of the web's menu under the chip. */}
      <Sheet open={estimating !== null} title={estimating ? `Estimate for ${estimating.title}` : undefined} onClose={() => setEstimating(null)} footer={<Button variant="quiet" label="Cancel" onPress={() => setEstimating(null)} />}>
        {PLAN_ESTIMATES.map((m) => (
          <MenuRow
            key={m}
            label={formatMinutes(m)}
            current={estimating?.estimateMin === m}
            onPress={() => {
              const task = estimating;
              setEstimating(null);
              if (task) p.onEstimate?.(task.id, m);
            }}
          />
        ))}
      </Sheet>
      {/* A carried row's moves, by name, as the web's row menu has them at phone width. */}
      <RowMenuSheet
        task={menu}
        items={
          menu
            ? [
                { label: "Today", onPress: () => p.onCarry(menu.id, "today") },
                { label: "Tomorrow", onPress: () => p.onCarry(menu.id, "tomorrow") },
                { label: "Someday", onPress: () => p.onCarry(menu.id, "someday") },
                { label: "Drop", onPress: () => p.onCarry(menu.id, "drop") },
              ]
            : []
        }
        onClose={() => setMenu(null)}
      />
    </>
  );
}

/** A group of the picker: a 44-point header that folds it, with its count. */
function Group({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const c = useColours();
  const [open, setOpen] = useState(true);
  return (
    <Disclosure label={title} count={count} open={open} onToggle={setOpen}>
      {count === 0 ? <Text style={[styles.nothing, { color: c.ink3 }]}>Nothing here.</Text> : <Card>{children}</Card>}
    </Disclosure>
  );
}

/**
 * A row of the picker: the tick where a task row's ring would be, the title (which ticks too), and under it the chips
 * in the family's tones. The day chip says where a task waits ("Inbox", "Wed"); under "Carried over" it would only
 * repeat the heading, and once picked the task is on today.
 */
function PickRow({ task, picked, today, defaultEstimateMin, onPick, onEstimate, onMore }: { task: Task; picked: boolean; today: LocalDate; defaultEstimateMin: number; onPick: (task: Task, picked: boolean) => void; onEstimate?: () => void; onMore?: () => void }) {
  const c = useColours();
  const chip = dayChip(task, today);
  const missed = Boolean(task.deadline && compareDates(task.deadline, today) < 0);
  const estimate = `${formatMinutes(task.estimateMin ?? defaultEstimateMin)}${task.estimateMin == null ? "?" : ""}`;
  const estimateChip = <Chip tone={task.estimateMin ? "neutral" : "guess"} label={estimate} />;
  return (
    <View style={styles.row}>
      <CheckBox checked={picked} onChange={(next) => onPick(task, next)} accessibilityLabel={`Pick ${task.title}`} />
      <View style={styles.rowBody}>
        <Pressable accessibilityRole="button" accessibilityLabel={task.title} accessibilityHint={picked ? "Takes it off today" : "Puts it on today"} onPress={() => onPick(task, !picked)}>
          <Text numberOfLines={2} style={[styles.title, { color: c.ink }]}>
            {task.title}
          </Text>
        </Pressable>
        <View style={styles.chips}>
          {!picked && chip && chip.tone !== "carried" ? <Chip label={chip.label} /> : null}
          {task.deadline ? <Chip tone={missed ? "deadline" : "neutral"} label={formatDay(task.deadline, { today })} accessibilityLabel={`${missed ? "Deadline missed" : "Deadline"} ${formatDay(task.deadline, { today })}`} /> : null}
          {task.carryCount > 1 ? <Text style={[styles.count, { color: c.ink3 }]}>×{task.carryCount}</Text> : null}
          {onEstimate ? (
            // 26 points drawn, 44 to the finger.
            <Pressable accessibilityRole="button" accessibilityLabel={`Estimate for ${task.title}`} accessibilityValue={{ text: task.estimateMin ? estimate : `No estimate, counted as ${formatMinutes(defaultEstimateMin)}` }} onPress={onEstimate} hitSlop={{ top: 9, bottom: 9, left: 6, right: 6 }}>
              {estimateChip}
            </Pressable>
          ) : (
            estimateChip
          )}
        </View>
      </View>
      {onMore ? <RowMore label={`More actions for ${task.title}`} onPress={onMore} /> : null}
    </View>
  );
}

/**
 * The gentle ask in place of a carried row's moves (SCREENS.md §2.3): the same panel and the same sentence as
 * Today's list (today/sections.tsx), four answers always in this order, "Keep today" first.
 */
function CarryAsk({ count, onKeep, onSomeday, onBreakDown, onDrop }: { count: number; onKeep: () => void; onSomeday: () => void; onBreakDown?: () => void; onDrop: () => void }) {
  const c = useColours();
  const answer = (label: string, onPress: () => void, first = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.answer}>
      <Text style={[styles.answerText, first ? { color: c.over, fontFamily: font.semibold } : { color: c.ink2 }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View accessibilityLabel="Still want this?" style={[styles.ask, { backgroundColor: c.overSoft, borderColor: c.overFill }]}>
      <Text style={[styles.askText, { color: c.ink }]}>Carried over {count} times — still want this?</Text>
      <View style={styles.answers}>
        {answer("Keep today", onKeep, true)}
        {answer("Someday", onSomeday)}
        {onBreakDown ? answer("Break it down", onBreakDown) : null}
        {answer("Drop", onDrop)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { marginHorizontal: 16, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  summaryText: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  coach: { marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  coachHead: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, fontVariant: ["tabular-nums"] },
  medium: { fontFamily: font.semibold },
  coachReason: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  coachActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  lead: { marginHorizontal: 20, marginTop: 12, fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  nothing: { marginHorizontal: 22, marginBottom: 4, fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  note: { marginHorizontal: 20, marginTop: 16, fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingLeft: 4, paddingRight: 4 },
  rowBody: { flex: 1, paddingVertical: 8, paddingRight: 10 },
  title: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 4 },
  count: { fontFamily: font.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
  more: { minHeight: TARGET, justifyContent: "center", paddingHorizontal: 16 },
  moreText: { fontFamily: font.medium, fontSize: 15, textDecorationLine: "underline", fontVariant: ["tabular-nums"] },
  // As Today's ask (today/sections.tsx).
  ask: { marginLeft: 48, marginRight: 12, marginBottom: 12, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingTop: 8 },
  askText: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  answers: { flexDirection: "row", flexWrap: "wrap", marginLeft: -8 },
  answer: { minHeight: TARGET, justifyContent: "center", paddingHorizontal: 8 },
  answerText: { fontFamily: font.medium, fontSize: 14 },
});
