// Today as the phone draws it (ANDROID_APP_SPEC.md §9; SCREENS.md §2 at phone width; the web's is app/(app)/today/
// page.tsx): the sky, the day with the arrows that step it, the hero card with the spare-time figure and the ribbon,
// the ritual of the hour beside the List | Day control, Plan my day and the carried-over review on a line under
// them, then either the lists (Carried over, the day, This evening, what was finished) or the day's timeline in
// their place. While the lists scroll, the hero card and the ritual row stay under the top edge and the lists pass
// beneath them (SCREENS.md §2.8, §22); the line under them scrolls away with the lists. Presentational: it is handed
// everything it shows, so it is drawn with fixtures in the browser preview and in tests, and with the real day by
// today.tsx. The parts are in today/ (ribbon.tsx, sections.tsx, notes.tsx, menus.tsx); the timeline is handed in
// whole (`dayPane`).
import { useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "~/ui/text";
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import type { DayPart } from "@/features/looks/look";
import type { TimelineBlock } from "@/features/today/hooks/use-today";
import { Icon } from "~/ui/icon";
import { IconButton, Screen } from "~/ui/screen";
import { Segmented } from "~/ui/segmented";
import { StickyScreen } from "~/ui/sticky-screen";
import { TARGET, font, useColours } from "~/ui/theme";
import { RowMenuSheet, type RowMenuItem } from "./today/menus";
import { BlockNudgeLine, CalendarLine, ClosedDay, ExpiredLine, PastDayNote, type CalendarLineProps } from "./today/notes";
import { Hero, type BreakdownOpen } from "./today/ribbon";
import type { RibbonBreakdown, RibbonShape } from "./today/ribbon-shape";
import { CarriedSection, DaySection, EveningSection, type PullInRow, type RowContext } from "./today/sections";
import type { Row } from "./today-rows";
import type { Summary } from "./today-summary";

export type TodayMode = "list" | "day";

/** The ritual of the hour (DESIGN_SYSTEM.md §5 "ritual row"): the morning plan until the day nears its end, then the shutdown. */
export interface Ritual {
  /** The plan is projected to be done, or the day is two hours from its end: the row offers the shutdown. */
  shutdown: boolean;
  /** Beside Shutdown: "done by 16:25", or "Day’s over". */
  shutdownNote: string | null;
  /** "Planned at 08:42" once the morning plan has been done today. */
  plannedLabel: string | null;
  onPlan: () => void;
  onShutdown: () => void;
  /** Plan my day (or re-plan), on a working day: its words, and whether its preview is open. */
  plan?: { label: string; open: boolean; onOpen: () => void } | null;
  /** The morning review on demand, when something was carried over. */
  onReview?: () => void;
}

export interface TodayViewProps {
  part: DayPart;
  /** "Today · Evening"; on another day, how far it is: "Tomorrow", "In 3 days", "4 days ago". */
  eyebrow: string;
  /** "Saturday 21 November" */
  title: string;
  today?: LocalDate;
  /** Today stepped to another day: the way back. Left out on today itself. */
  onBackToToday?: () => void;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  /** The day's all-day events, by title, for the line under the date. */
  allDay?: readonly string[];
  /** A day that has passed: a short note, what was finished, nothing to plan. */
  past?: boolean;
  summary: Summary;
  ribbon?: RibbonShape | null;
  /** What a tap on the ribbon opens: the spare-time breakdown. Left out, the ribbon is only drawn. */
  breakdown?: RibbonBreakdown | null;
  /** The breakdown's "Add something", on free time: quick add for the day shown. */
  onAddSomething?: () => void;
  /** The breakdown's "Show on timeline", on a meeting. */
  onShowMeeting?: (meeting: { start: number; end: number }) => void;
  onTrim?: () => void;
  onPlanDay?: () => void;
  onConnectCalendar?: () => void;
  /** The day was shut down: its summary stands where the hero would. */
  closed?: { line: string; highlights: string | null } | null;
  expired?: { line: string; onReview: () => void; onDismiss: () => void } | null;
  /** "Want a nudge when this starts?", asked once after the first block made here (push/use-block-nudge.ts). */
  blockNudge?: { error: string | null; asking: boolean; onYes: () => void; onNotNow: () => void; onClose: () => void } | null;
  calendar?: CalendarLineProps | null;
  ritual?: Ritual | null;
  /** List or Day; Day needs `dayPane`, which a day without working hours does not have. */
  mode?: TodayMode;
  onMode?: (mode: TodayMode) => void;
  /**
   * The day's timeline, drawn in the lists' place. It is handed what to draw over its hours, scrolling away with
   * them: the hero, on a phone too short to keep the hero and the hours in view together.
   */
  dayPane?: (above: ReactNode) => ReactNode;
  /**
   * Plan my day's preview is open over the Day view: nothing stays over the hours, since its sheet needs the room
   * (the hero scrolls away with them on any phone).
   */
  previewing?: boolean;
  /** Carried over, the day and This evening, as one run of rows (today-rows.ts). */
  rows: readonly Row[];
  /** The day's own section name: "Today", or the day stepped to. */
  dayLabel?: string;
  dayState?: "planned" | "all-done" | "empty";
  spareMin?: number;
  pullIn?: readonly PullInRow[];
  carriedFolded?: boolean;
  onExpandCarried?: () => void;
  onClearSlate?: () => void;
  onAllTomorrow?: () => void;
  onAllSomeday?: () => void;
  eveningOpen?: boolean;
  onEveningToggle?: (open: boolean) => void;
  eveningFull?: boolean;
  /** What was finished on the day, drawn by whoever knows where it comes from (DoneSection, or the older day's list). */
  done?: ReactNode;
  defaultEstimateMin: number;
  blocksByTask?: ReadonlyMap<string, readonly TimelineBlock[]>;
  projectNames?: ReadonlyMap<string, string>;
  removed?: ReadonlySet<string>;
  onComplete: (task: Task) => void;
  onOpen?: (task: Task) => void;
  /** A row's moves; each is offered in the row's "More actions" (or the carry ask) only when it is handed in. */
  onToday?: (task: Task) => void;
  onTomorrow?: (task: Task) => void;
  onSomeday?: (task: Task) => void;
  onDrop?: (task: Task) => void;
  /** "Convert to project", and the ask's "Break it down". */
  onConvert?: (task: Task) => void;
  /** Reordering by hand; left out while a sort holds the rows still. */
  onMoveUp?: (task: Task) => void;
  onMoveDown?: (task: Task) => void;
  /** "Block": the task then waits for a tap on the timeline. */
  onBlock?: (task: Task) => void;
  onDismissRemoved?: (task: Task) => void;
  onMenu: () => void;
  /** Room left at the bottom for whatever floats over the list (the add button). */
  bottomRoom?: number;
}

/** From this many points of height a phone shows the hero and a useful stretch of the day's hours together. */
const TALL = 760;

const MODES: readonly { value: TodayMode; label: string }[] = [
  { value: "list", label: "List" },
  { value: "day", label: "Day" },
];

export function TodayView(p: TodayViewProps) {
  const c = useColours();
  // The row whose "More actions" is open, and the section it is in.
  const [menu, setMenu] = useState<{ task: Task; section: "carried" | "day" | "evening" } | null>(null);
  // All done: whether "Pull something in" is unfolded.
  const [pulling, setPulling] = useState(false);
  // The ribbon's breakdown, held here so a touch anywhere else closes it (the touch still does what it was for).
  const [breakdown, setBreakdown] = useState<BreakdownOpen | null>(null);
  const onHero = useRef(false);
  const touched = () => {
    if (!onHero.current && breakdown) setBreakdown(null);
    onHero.current = false;
  };
  const sections: Record<"carried" | "day" | "evening", Task[]> = { carried: [], day: [], evening: [] };
  let dayLabel = p.dayLabel ?? "Today";
  for (const row of p.rows) {
    if (row.kind === "task") sections[row.section].push(row.ask ? ({ ...row.task, ask: true } as Task) : row.task);
    else if (row.section === "day") dayLabel = p.dayLabel ?? row.label;
  }
  const hasDay = p.dayPane !== undefined;
  const mode: TodayMode = hasDay && p.mode === "day" ? "day" : "list";
  const ctx = (section: "carried" | "day" | "evening"): RowContext => ({
    today: p.today,
    defaultEstimateMin: p.defaultEstimateMin,
    blocksByTask: p.blocksByTask,
    projectNames: p.projectNames,
    removed: p.removed,
    onComplete: p.onComplete,
    onOpen: p.onOpen,
    onMore: itemsFor(section).length > 0 ? (task) => setMenu({ task, section }) : undefined,
    onDismissRemoved: p.onDismissRemoved,
  });
  // What a row offers, by section, as the web's rows do at phone width.
  function itemsFor(section: "carried" | "day" | "evening", task?: Task): RowMenuItem[] {
    const item = (label: string, run: ((task: Task) => void) | undefined): RowMenuItem[] => (run ? [{ label, onPress: () => task && run(task) }] : []);
    if (section === "carried") return [...item("Today", p.onToday), ...item("Tomorrow", p.onTomorrow), ...item("Someday", p.onSomeday), ...item("Drop", p.onDrop), ...item("Convert to project", p.onConvert)];
    if (section === "evening") return item("Convert to project", p.onConvert);
    return [...item("Move up", p.onMoveUp), ...item("Move down", p.onMoveDown), ...item("Tomorrow", p.onTomorrow), ...item("Block", p.onBlock), ...item("Convert to project", p.onConvert)];
  }
  const noop = () => undefined;
  const ritual = p.ritual;
  // In the Day view the hero stays over the hours where the phone is tall enough for both; on a shorter one it
  // scrolls away with them, and the List | Day control alone stays.
  const tall = useWindowDimensions().height >= TALL;

  const closed = p.closed ? <ClosedDay line={p.closed.line} highlights={p.closed.highlights} /> : null;
  const hero =
    p.closed || p.past ? null : (
      // A touch that starts on the hero is the ribbon's own (or its panel's); any other closes the breakdown.
      <View collapsable={false} onTouchStart={() => (onHero.current = true)}>
        <Hero
          summary={p.summary}
          ribbon={p.ribbon ?? null}
          onTrim={p.onTrim}
          onPlan={p.onPlanDay}
          onConnect={p.onConnectCalendar}
          breakdown={p.breakdown}
          open={breakdown}
          onOpen={setBreakdown}
          onAdd={p.onAddSomething}
          onMeeting={p.onShowMeeting}
        />
      </View>
    );
  const ritualRow =
    (ritual || hasDay) && (
      <View style={styles.ritual}>
        <View style={styles.ritualWords}>
          {ritual ? (
            ritual.shutdown ? (
              <>
                <RitualLink label="Shutdown" onPress={ritual.onShutdown} />
                {ritual.shutdownNote ? <Text style={[styles.ritualNote, { color: c.ink3 }]}>{ritual.shutdownNote}</Text> : null}
              </>
            ) : ritual.plannedLabel ? (
              <Text style={[styles.ritualNote, styles.planned, { color: c.ink3 }]}>{ritual.plannedLabel}</Text>
            ) : (
              <>
                <RitualLink label="Morning plan" onPress={ritual.onPlan} />
                <Text style={[styles.ritualNote, { color: c.ink3 }]}>Not planned yet</Text>
              </>
            )
          ) : null}
        </View>
        {hasDay ? (
          <View style={styles.modes}>
            <Segmented label="Show" options={MODES} value={mode} onChange={(next) => p.onMode?.(next)} />
          </View>
        ) : null}
      </View>
    );

  // The line under the ritual row (the web's RitualActions): Plan my day, or re-plan, and the carried-over review.
  const plan = ritual && hasDay ? ritual.plan : null;
  const ritualActions =
    plan || ritual?.onReview ? (
      <View testID="ritual-actions" style={styles.ritualActions}>
        {plan ? (
          <Pressable accessibilityRole="button" accessibilityLabel={plan.label} accessibilityState={{ expanded: plan.open }} onPress={plan.onOpen} style={styles.review}>
            <Text style={[styles.reviewText, { color: c.ink }]}>{plan.label}</Text>
          </Pressable>
        ) : null}
        {ritual?.onReview ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Review carried" onPress={ritual.onReview} style={styles.review}>
            <Text style={[styles.reviewText, { color: c.ink2 }]}>Review carried</Text>
          </Pressable>
        ) : null}
      </View>
    ) : null;
  const actions = (
    <>
      {p.onPrevDay ? <IconButton icon="arrow-left" label="Previous day" onPress={p.onPrevDay} /> : null}
      {p.onNextDay ? <IconButton icon="arrow-right" label="Next day" onPress={p.onNextDay} /> : null}
      <IconButton icon="more" label="Today options" onPress={p.onMenu} />
    </>
  );
  const under =
    p.onBackToToday || (p.allDay && p.allDay.length > 0) ? (
      <View style={styles.under}>
        {p.onBackToToday ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back to today" onPress={p.onBackToToday} style={styles.back}>
            <Icon name="arrow-left" size={14} color={c.ink2} />
            <Text style={[styles.backText, { color: c.ink2 }]}>back to today</Text>
          </Pressable>
        ) : null}
        {/* All-day events sit under the date, never in the busy time. */}
        {p.allDay && p.allDay.length > 0 ? <Text style={[styles.allDay, { color: c.ink2 }]}>All day: {p.allDay.join(" · ")}</Text> : null}
      </View>
    ) : null;
  const rowMenu = <RowMenuSheet task={menu?.task ?? null} items={menu ? itemsFor(menu.section, menu.task) : []} onClose={() => setMenu(null)} />;

  if (mode === "day") {
    // The hero stays over the hours where the phone is tall enough for both, unless the plan's preview needs the room.
    const heroStays = tall && !p.previewing;
    return (
      <View testID="today-screen" collapsable={false} style={styles.fill} onTouchStart={touched}>
        {/* The Day view's hours scroll by themselves, under the hero. */}
        <Screen title={p.title} eyebrow={p.eyebrow} part={p.part} bottomRoom={p.bottomRoom} scroll={false} actions={actions}>
          {under}
          {heroStays ? (closed ?? hero) : null}
          {ritualRow}
          {ritualActions}
          <View style={styles.fill}>{p.dayPane?.(heroStays ? null : (closed ?? hero))}</View>
          {rowMenu}
        </Screen>
      </View>
    );
  }
  return (
    <View testID="today-screen" collapsable={false} style={styles.fill} onTouchStart={touched}>
      <StickyScreen
        title={p.title}
        eyebrow={p.eyebrow}
        part={p.part}
        bottomRoom={p.bottomRoom}
        actions={actions}
        before={
          <>
            {under}
            {p.expired ? <ExpiredLine {...p.expired} /> : null}
            {p.blockNudge ? <BlockNudgeLine {...p.blockNudge} /> : null}
            {p.past ? <PastDayNote /> : null}
            {p.calendar ? <CalendarLine {...p.calendar} /> : null}
            {closed}
          </>
        }
        // The hero card and the ritual row stay in sight; a day that was shut down or has passed has no hero to keep.
        sticky={
          <>
            {hero}
            {ritualRow}
          </>
        }
      >
        {ritualActions}
        <CarriedSection
          tasks={sections.carried}
          folded={Boolean(p.carriedFolded)}
          onExpand={p.onExpandCarried ?? noop}
          onClearSlate={p.onClearSlate ?? noop}
          onKeep={p.onToday ?? noop}
          onSomeday={p.onSomeday ?? noop}
          onBreakDown={p.onConvert ?? noop}
          onDrop={p.onDrop ?? noop}
          onAllTomorrow={p.onAllTomorrow ?? noop}
          onAllSomeday={p.onAllSomeday ?? noop}
          ctx={ctx("carried")}
        />
        {/* A day that has passed lists only what was finished on it (below). */}
        {!p.past ? (
          <DaySection
            label={dayLabel}
            tasks={sections.day}
            state={p.dayState ?? (p.rows.length === 0 ? "empty" : "planned")}
            spareMin={p.spareMin ?? 0}
            pullIn={p.pullIn ?? []}
            pulling={pulling}
            onPull={() => setPulling((v) => !v)}
            onPullIn={p.onToday ?? noop}
            onPlan={p.onPlanDay ?? noop}
            onShutdown={ritual?.onShutdown ?? noop}
            ctx={ctx("day")}
          />
        ) : null}
        <EveningSection tasks={sections.evening} open={p.eveningOpen ?? true} onToggle={p.onEveningToggle ?? noop} full={Boolean(p.eveningFull)} ctx={ctx("evening")} />
        {p.done}
        {rowMenu}
      </StickyScreen>
    </View>
  );
}

/** A ritual's link: "Morning plan ›", "Shutdown ›", in a 44-point target. */
function RitualLink({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColours();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={styles.ritualLink}>
      <Text style={[styles.ritualLinkText, { color: c.ink }]}>{label}</Text>
      <Icon name="chevron-right" size={16} color={c.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  under: { marginHorizontal: 20, marginTop: -12, marginBottom: 8 },
  back: { minHeight: TARGET, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { fontFamily: font.medium, fontSize: 15, textDecorationLine: "underline" },
  allDay: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  ritual: { minHeight: TARGET, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginHorizontal: 20, marginTop: 8 },
  ritualWords: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  ritualLink: { minHeight: TARGET, flexDirection: "row", alignItems: "center", gap: 2 },
  ritualLinkText: { fontFamily: font.semibold, fontSize: 15 },
  ritualNote: { fontFamily: font.regular, fontSize: 13, fontVariant: ["tabular-nums"] },
  planned: { paddingVertical: 12 },
  modes: { width: 132 },
  ritualActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 16, marginHorizontal: 20 },
  review: { minHeight: TARGET, justifyContent: "center" },
  reviewText: { fontFamily: font.medium, fontSize: 15, textDecorationLine: "underline" },
});
