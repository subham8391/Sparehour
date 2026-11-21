// Today's sections on the phone (SCREENS.md §2.3 to §2.5, §2.7; the web's are app/(app)/today/page.tsx with
// features/today/day-states.tsx, evening-section.tsx and features/tasks/carry-ask.tsx): Carried over with its fold,
// its ask and its whole-pile moves; the day's own list; This evening, folded to its label until it is opened; what
// was finished; and what the list says when it has no rows (all done, the empty day). Presentational: rows in, taps
// out. A row's actions are in its "More actions" sheet, as the web's are at phone width.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { coveredMinutes, estimateMismatch } from "@/core/blocking/coverage";
import { formatMinutes, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { FinishedDayStatus } from "@/features/finished/use-finished-day";
import type { TimelineBlock } from "@/features/today/hooks/use-today";
import { hhmm } from "@/features/today/timeline-geometry";
import { ActionLine } from "~/ui/action-line";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { Disclosure } from "~/ui/disclosure";
import { Icon } from "~/ui/icon";
import { RowMore } from "~/ui/nav-row";
import { SectionLabel } from "~/ui/section-label";
import { TaskLine } from "~/ui/task-line";
import { TARGET, font, useColours } from "~/ui/theme";

/** What a row shows beside its task, and what its taps do. */
export interface RowContext {
  /** The day the list stands on, so a deadline can say whether it was missed. */
  today?: LocalDate;
  defaultEstimateMin: number;
  /** Each task's blocks on the day, earliest first: a blocked row carries its block's time in place of its own. */
  blocksByTask?: ReadonlyMap<string, readonly TimelineBlock[]>;
  projectNames?: ReadonlyMap<string, string>;
  /** Tasks whose block Google removed: one quiet line under the row, once. */
  removed?: ReadonlySet<string>;
  onComplete: (task: Task) => void;
  onOpen?: (task: Task) => void;
  /** Opens the row's "More actions"; left out, the row has none. */
  onMore?: (task: Task) => void;
  onDismissRemoved?: (task: Task) => void;
}

/**
 * The chip a blocked task carries (SCREENS.md §2.6 "a small block indicator"): its first block's start, "+1" for each
 * more, and for a screen reader every range and, when they and the estimate disagree, by how much: a hint, never an error.
 */
function BlockChip({ blocks, estimateMin }: { blocks: readonly TimelineBlock[]; estimateMin: number | null }) {
  const c = useColours();
  const off = estimateMismatch(coveredMinutes(blocks), estimateMin);
  const says = `Blocked ${blocks.map((b) => `${hhmm(b.start)}–${hhmm(b.end)}`).join(", ")}${off ? ` · ${formatMinutes(off.min)} ${off.kind === "short" ? "short of" : "over"} the estimate` : ""}`;
  return (
    <>
      <Chip tone="time" label={hhmm(blocks[0].start)} accessibilityLabel={says} />
      {blocks.length > 1 && <Text style={[styles.more, { color: c.ink2 }]}>+{blocks.length - 1}</Text>}
    </>
  );
}

function TaskRows({ tasks, ctx, under, more = true, footer }: { tasks: readonly Task[]; ctx: RowContext; /** What sits under a row, inside it (the carry ask). */ under?: (task: Task) => ReactNode; /** Whether a row has "More actions". */ more?: boolean | ((task: Task) => boolean); footer?: ReactNode }) {
  const c = useColours();
  return (
    <Card>
      {tasks.map((task, i) => {
        const blocks = ctx.blocksByTask?.get(task.id);
        const hasMore = ctx.onMore && (typeof more === "function" ? more(task) : more);
        return (
          <CardRow key={task.id} first={i === 0}>
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <TaskLine
                  // A blocked row's chip stands in for the do-time chip.
                  task={blocks ? { ...task, doTime: null } : task}
                  today={ctx.today}
                  defaultEstimateMin={ctx.defaultEstimateMin}
                  detail={task.projectId ? ctx.projectNames?.get(task.projectId) : undefined}
                  extra={blocks ? <BlockChip blocks={blocks} estimateMin={task.estimateMin} /> : undefined}
                  onComplete={() => ctx.onComplete(task)}
                  onPress={ctx.onOpen ? () => ctx.onOpen?.(task) : undefined}
                />
              </View>
              {hasMore ? <RowMore label={`More actions for ${task.title}`} onPress={() => ctx.onMore?.(task)} /> : null}
            </View>
            {under?.(task)}
            {ctx.removed?.has(task.id) && !blocks ? (
              <View style={styles.removed}>
                <Text style={[styles.removedText, { color: c.ink3 }]}>Block removed in Google Calendar</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss the note" onPress={() => ctx.onDismissRemoved?.(task)} style={styles.dismiss}>
                  <Icon name="close" size={14} color={c.ink3} />
                </Pressable>
              </View>
            ) : null}
          </CardRow>
        );
      })}
      {footer}
    </Card>
  );
}

const total = (tasks: readonly Task[], defaultEstimateMin: number) => tasks.reduce((sum, t) => sum + (t.estimateMin ?? defaultEstimateMin), 0);

/** A quiet text button at a section label's far edge, or in a card's last row. */
function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColours();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={styles.textAction}>
      <Text style={[styles.textActionText, { color: c.ink2 }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The gentle ask in place of a row's actions once it has been carried over too many times (SCREENS.md §2.3): an amber
 * panel, never a red flag, with four answers always in this order, "Keep today" first because a no-penalty yes must exist.
 */
function CarryAsk({ count, onKeep, onSomeday, onBreakDown, onDrop }: { count: number; onKeep: () => void; onSomeday: () => void; onBreakDown: () => void; onDrop: () => void }) {
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
        {answer("Break it down", onBreakDown)}
        {answer("Drop", onDrop)}
      </View>
    </View>
  );
}

export interface CarriedProps {
  tasks: readonly (Task & { ask?: boolean })[];
  /** More than eight carried and not opened yet today: one summary line. */
  folded: boolean;
  onExpand: () => void;
  onClearSlate: () => void;
  onKeep: (task: Task) => void;
  onSomeday: (task: Task) => void;
  onBreakDown: (task: Task) => void;
  onDrop: (task: Task) => void;
  /** The whole pile at once, each one statement and one undo. */
  onAllTomorrow: () => void;
  onAllSomeday: () => void;
  ctx: RowContext;
}

export function CarriedSection(p: CarriedProps) {
  const c = useColours();
  if (p.tasks.length === 0) return null;
  if (p.folded) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Carried over, ${p.tasks.length}. Expand`} accessibilityState={{ expanded: false }} onPress={p.onExpand} style={styles.folded}>
        <Text style={[styles.foldedLabel, { color: c.ink3 }]}>
          CARRIED OVER <Text style={{ color: c.ink }}>{p.tasks.length}</Text>
          <Text style={styles.plain}> — </Text>
          <Text style={[styles.plain, styles.underlined, { color: c.ink2 }]}>Expand</Text>
        </Text>
      </Pressable>
    );
  }
  return (
    <View>
      <SectionLabel label="Carried over" count={p.tasks.length} action={<TextAction label="Clear the slate" onPress={p.onClearSlate} />} />
      <TaskRows
        tasks={p.tasks}
        ctx={p.ctx}
        // The three-carry ask takes the place of the row's actions, in place.
        more={(task) => !(task as Task & { ask?: boolean }).ask}
        under={(task) =>
          (task as Task & { ask?: boolean }).ask ? <CarryAsk count={task.carryCount} onKeep={() => p.onKeep(task)} onSomeday={() => p.onSomeday(task)} onBreakDown={() => p.onBreakDown(task)} onDrop={() => p.onDrop(task)} /> : null
        }
        footer={
          p.tasks.length >= 3 ? (
            <CardRow style={styles.pile}>
              <TextAction label="Move all to tomorrow" onPress={p.onAllTomorrow} />
              <TextAction label="All to Someday" onPress={p.onAllSomeday} />
            </CardRow>
          ) : null
        }
      />
    </View>
  );
}

/** Something to pull in (the empty day, All done): where it comes from, and Today. */
export interface PullInRow {
  task: Task;
  /** "starts today", "inbox", "someday"; nothing for one with a deadline near. */
  source: string | null;
}

export interface DayProps {
  /** "Today", or the day Today was stepped to ("Tomorrow", "Thu"). */
  label: string;
  tasks: readonly Task[];
  /** Which words stand in for the rows when there are none (features/today/day-state.ts). */
  state: "planned" | "all-done" | "empty";
  /** The spare time to name with them, or 0 to say nothing about it. */
  spareMin: number;
  pullIn: readonly PullInRow[];
  /** All done: whether "Pull something in" is unfolded. */
  pulling: boolean;
  onPull: () => void;
  onPullIn: (task: Task) => void;
  onPlan: () => void;
  onShutdown: () => void;
  ctx: RowContext;
}

function PullIn({ rows, onOpen, onToday }: { rows: readonly PullInRow[]; onOpen?: (task: Task) => void; onToday: (task: Task) => void }) {
  return (
    <>
      {rows.map(({ task, source }) => (
        <CardRow key={task.id}>
          <ActionLine title={task.title} detail={source ?? undefined} onPress={onOpen ? () => onOpen(task) : undefined} action={{ label: "Today", accessibilityLabel: `Do ${task.title} today`, onPress: () => onToday(task) }} />
        </CardRow>
      ))}
    </>
  );
}

export function DaySection(p: DayProps) {
  const c = useColours();
  return (
    <View>
      <SectionLabel label={p.label} count={p.tasks.length} detail={formatMinutes(total(p.tasks, p.ctx.defaultEstimateMin))} />
      {p.tasks.length > 0 ? (
        <TaskRows tasks={p.tasks} ctx={p.ctx} />
      ) : p.state === "all-done" ? (
        // All done (SCREENS.md §2.7): the facts and the two ways on, no celebration graphic.
        <Card>
          <View style={styles.state}>
            <Text style={[styles.stateTitle, { color: c.ink }]}>
              That’s everything you planned.{p.spareMin > 0 ? ` ${formatMinutes(p.spareMin)} left.` : ""}
            </Text>
            <Button block label="Pull something in" accessibilityLabel={p.pulling ? "Pull something in, shown" : "Pull something in"} onPress={p.onPull} />
            <Button block variant="quiet" label="Shutdown ›" accessibilityLabel="Shutdown" onPress={p.onShutdown} />
            {p.pulling && p.pullIn.length === 0 ? <Text style={[styles.stateLine, { color: c.ink2 }]}>Nothing waiting to pull in.</Text> : null}
          </View>
          {p.pulling ? <PullIn rows={p.pullIn} onOpen={p.ctx.onOpen} onToday={p.onPullIn} /> : null}
        </Card>
      ) : p.state === "empty" ? (
        // The returning person's empty day (ONBOARDING.md §4): a planning prompt, not an empty illustration.
        <Card>
          <View style={styles.state}>
            <Text style={[styles.stateTitle, { color: c.ink }]}>
              Nothing planned for today.{p.spareMin > 0 ? ` You have ${formatMinutes(p.spareMin)}.` : ""}
            </Text>
            <Button block variant="primary" label="Plan my day · 2 min" accessibilityLabel="Plan my day" onPress={p.onPlan} />
            {p.pullIn.length > 0 ? <Text style={[styles.stateLine, { color: c.ink2 }]}>or pull something in:</Text> : null}
          </View>
          <PullIn rows={p.pullIn} onOpen={p.ctx.onOpen} onToday={p.onPullIn} />
          <CardRow first={p.pullIn.length === 0}>
            <Text style={[styles.stateLine, styles.stateFoot, { color: c.ink3 }]}>Or tap + to add a task.</Text>
          </CardRow>
        </Card>
      ) : (
        <Card>
          <Text style={[styles.nothing, { color: c.ink3 }]}>Nothing planned yet.</Text>
        </Card>
      )}
    </View>
  );
}

export interface EveningProps {
  tasks: readonly Task[];
  /** Folded to its label until it is opened; the choice is remembered on the phone. */
  open: boolean;
  onToggle: (open: boolean) => void;
  /** More planned than the evening has time for: one quiet line, never the over colour. */
  full: boolean;
  ctx: RowContext;
}

export function EveningSection(p: EveningProps) {
  const c = useColours();
  if (p.tasks.length === 0) return null;
  const fullLine = p.full ? <Text style={[styles.full, { color: c.ink2 }]}>That’s a full evening.</Text> : null;
  return (
    <View>
      <Disclosure label="This evening" count={p.tasks.length} detail={formatMinutes(total(p.tasks, p.ctx.defaultEstimateMin))} open={p.open} onToggle={p.onToggle}>
        {fullLine}
        <TaskRows tasks={p.tasks} ctx={p.ctx} />
      </Disclosure>
      {/* Shut, the full line stays in view under the label. */}
      {!p.open ? fullLine : null}
    </View>
  );
}

/** A finished task the server kept, older than the week the phone holds: it opens read-only. */
export interface OlderRow {
  id: string;
  title: string;
  detail?: string;
}

export interface DoneProps {
  /** "Done today", "Done on Thu 8 Oct": what a screen reader hears for the section. */
  label: string;
  /** The phone's own finished tasks of the day. */
  tasks: readonly Task[];
  /** A day older than the phone's week: what the server kept of it, and how asking for it went; null for any other day. */
  older: { status: FinishedDayStatus; rows: readonly OlderRow[]; onRetry: () => void; onOpen: (id: string) => void } | null;
  /** Reopen; null on a day that has passed, which only reads. */
  onReopen: ((task: Task) => void) | null;
  ctx: RowContext;
}

/** What was finished on the day (SCREENS.md §2.4 Show completed; §2.1 for a day that has passed, however old). */
export function DoneSection(p: DoneProps) {
  const c = useColours();
  const count = p.tasks.length + (p.older?.rows.length ?? 0);
  const status = p.older?.status;
  // Every state is words: nothing spins.
  const words =
    status === "loading"
      ? "Looking for what you finished on this day…"
      : (status === "ready" || status === "unavailable") && count === 0
        ? status === "ready"
          ? "Nothing was finished on this day."
          : "Finished tasks from this long ago are not available, so only this day’s blocks and meetings are left to show."
        : status === "offline"
          ? "You’re offline. Older finished tasks need a connection, and will show here when you are back online."
          : status === "error"
            ? "Couldn’t load what you finished on this day. Check the connection and try again."
            : null;
  if (count === 0 && !words) return null;
  const detail = (task: Task) => (task.projectId ? p.ctx.projectNames?.get(task.projectId) : undefined);
  return (
    <View accessibilityLabel={p.label}>
      {count > 0 ? (
        <>
          <SectionLabel label="Done" count={count} />
          <Card>
            {p.tasks.map((task, i) => (
              <CardRow key={task.id} first={i === 0}>
                {p.onReopen ? (
                  <TaskLine task={task} done today={p.ctx.today} defaultEstimateMin={p.ctx.defaultEstimateMin} detail={detail(task)} onComplete={() => p.onReopen?.(task)} onPress={p.ctx.onOpen ? () => p.ctx.onOpen?.(task) : undefined} />
                ) : (
                  <ActionLine mark="done" title={task.title} detail={detail(task)} onPress={p.ctx.onOpen ? () => p.ctx.onOpen?.(task) : undefined} />
                )}
              </CardRow>
            ))}
            {(p.older?.rows ?? []).map((row, i) => (
              <CardRow key={row.id} first={p.tasks.length === 0 && i === 0}>
                <ActionLine mark="done" title={row.title} detail={row.detail} onPress={() => p.older?.onOpen(row.id)} />
              </CardRow>
            ))}
          </Card>
        </>
      ) : null}
      {words ? (
        <View style={styles.older}>
          <Text accessibilityLiveRegion="polite" style={[styles.stateLine, { color: status === "offline" || status === "error" ? c.ink2 : c.ink3 }]}>
            {words}
          </Text>
          {status === "offline" || status === "error" ? <Button label="Try again" onPress={() => p.older?.onRetry()} style={styles.retry} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  rowMain: { flex: 1 },
  more: { fontFamily: font.regular, fontSize: 13, fontVariant: ["tabular-nums"] },
  removed: { flexDirection: "row", alignItems: "center", marginLeft: 52, marginRight: 4, marginTop: -6 },
  removedText: { flex: 1, fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  dismiss: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  textAction: { minHeight: TARGET, justifyContent: "center", paddingHorizontal: 6, marginVertical: -12 },
  textActionText: { fontFamily: font.medium, fontSize: 14, textDecorationLine: "underline" },
  ask: { marginLeft: 52, marginRight: 12, marginBottom: 12, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingTop: 8 },
  askText: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  answers: { flexDirection: "row", flexWrap: "wrap", marginLeft: -8 },
  answer: { minHeight: TARGET, paddingHorizontal: 8, justifyContent: "center" },
  answerText: { fontFamily: font.medium, fontSize: 15 },
  folded: { minHeight: TARGET, justifyContent: "center", marginTop: 14, marginHorizontal: 22 },
  foldedLabel: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3, fontVariant: ["tabular-nums"] },
  plain: { fontFamily: font.medium, letterSpacing: 0 },
  underlined: { textDecorationLine: "underline" },
  pile: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, paddingHorizontal: 10, minHeight: TARGET, paddingVertical: 12 },
  state: { paddingHorizontal: 18, paddingVertical: 18, gap: 12 },
  stateTitle: { fontFamily: font.medium, fontSize: 20, lineHeight: 26 },
  stateLine: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  stateFoot: { paddingHorizontal: 18, paddingVertical: 12 },
  nothing: { fontFamily: font.regular, fontSize: 17, lineHeight: 23, paddingHorizontal: 18, paddingVertical: 14 },
  full: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginHorizontal: 22, marginBottom: 8 },
  older: { marginHorizontal: 22, marginTop: 10, gap: 10, alignItems: "flex-start" },
  retry: { alignSelf: "flex-start" },
});
