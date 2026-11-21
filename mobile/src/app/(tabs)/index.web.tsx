// The browser preview of Today (npm run preview): the real views, a made-up day (screens/today/today-fixture.ts).
// `?view=day` shows the timeline in the lists' place; `?scheme=dark`, `?part=evening`, `?state=empty|none|over`,
// `?day=other|past` and `?zoom=15|5` pick what is shown. Nothing here writes: a tap that would is said in the console.
// See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { ZOOM_STEPS, type ZoomStep } from "@/core/blocking";
import type { DayPart } from "@/features/looks/look";
import { todayFixture, NOW_MIN, TODAY } from "~/screens/today/today-fixture";
import { ribbonShape } from "~/screens/today/ribbon-shape";
import { DoneSection } from "~/screens/today/sections";
import { TimelineView } from "~/screens/today/timeline-view";
import { todayRows } from "~/screens/today-rows";
import { todaySummary } from "~/screens/today-summary";
import { TodayView, type TodayMode } from "~/screens/today-view";
import { Icon } from "~/ui/icon";
import { colours, type Scheme } from "~/ui/theme";

const said = (what: string) => () => console.log(`[preview] ${what}`);

export default function Preview() {
  const q = useLocalSearchParams<{ scheme?: string; part?: string; state?: string; view?: string; day?: string; zoom?: string }>();
  const scheme: Scheme = q.scheme === "dark" ? "dark" : "light";
  const part = (["morning", "afternoon", "evening", "night"].includes(q.part ?? "") ? q.part : "afternoon") as DayPart;
  const other = q.day === "other";
  const past = q.day === "past";
  const fixture = todayFixture({ state: q.state === "empty" ? "empty" : q.state === "none" ? "off" : q.state === "over" ? "over" : "open", now: !other && !past });
  const [mode, setMode] = useState<TodayMode>(q.view === "day" ? "day" : "list");
  const [zoom, setZoom] = useState<ZoomStep>((ZOOM_STEPS as readonly number[]).includes(Number(q.zoom)) ? (Number(q.zoom) as ZoomStep) : 30);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);
  const [eveningOpen, setEveningOpen] = useState(false);
  const cap = fixture.capacity;
  const hasDay = cap.state !== "no_work_day";
  const onToday = !other && !past;
  const c = colours[scheme];
  const rowContext = { today: TODAY, defaultEstimateMin: 35, projectNames: fixture.projectNames, onComplete: said("complete") };
  return (
    <View style={{ flex: 1 }}>
      <TodayView
        part={part}
        today={TODAY}
        eyebrow={other ? "In 2 days" : past ? "Yesterday" : `Today · ${part === "evening" || part === "night" ? "Evening" : part === "morning" ? "Morning" : "Afternoon"}`}
        title={other ? "Friday 20 November" : past ? "Tuesday 17 November" : "Wednesday 18 November"}
        onBackToToday={onToday ? undefined : said("back to today")}
        onPrevDay={said("previous day")}
        onNextDay={said("next day")}
        allDay={onToday && q.state !== "empty" ? ["Ana’s birthday"] : []}
        past={past}
        summary={todaySummary(cap, { plannedCount: fixture.tasks.length, finished: fixture.done.length > 0, otherDay: !onToday, trim: onToday, suggestion: q.state === "over" ? "Review the budget" : null })}
        ribbon={ribbonShape(cap, onToday ? NOW_MIN : undefined)}
        onTrim={onToday ? said("trim today") : undefined}
        onPlanDay={said("plan")}
        ritual={onToday ? { shutdown: false, shutdownNote: null, plannedLabel: null, onPlan: said("plan"), onShutdown: said("shutdown"), onReview: fixture.carried.length > 0 ? said("review carried") : undefined } : null}
        mode={mode}
        onMode={setMode}
        dayPane={
          hasDay
            ? (above) => (
            <TimelineView
              above={above}
              c={cap}
              nowMin={onToday ? NOW_MIN : past ? 24 * 60 : 0}
              nowShown={onToday}
              blocks={fixture.blocks}
              meetings={fixture.meetings}
              zoom={zoom}
              onZoom={setZoom}
              dayStart={9 * 60}
              dayEnd={18 * 60}
              bufferPct={15}
              hint={fixture.blocks.length === 0 && !past}
              {...(past
                ? {}
                : {
                    selectedBlockId: selected,
                    onSelectBlock: setSelected,
                    onMoveBlock: said("move block"),
                    onResizeBlock: said("resize block"),
                    onDuplicateBlock: said("duplicate block"),
                    onRemoveBlock: said("remove block"),
                    onToggleLock: said("lock"),
                    onRenameBlock: said("rename block"),
                    onOpenTask: said("open task"),
                    onAddBlock: said("add block"),
                    addable: fixture.addable,
                    placing: placing ? { title: placing } : null,
                    onTapSlot: () => setPlacing(null),
                    onCancelPlacing: () => setPlacing(null),
                  })}
            />
              )
            : undefined
        }
        rows={past ? [] : todayRows(onToday ? fixture.carried : [], fixture.tasks, fixture.evening, other ? "Fri" : "Today")}
        dayState={q.state === "empty" || q.state === "none" ? "empty" : "planned"}
        spareMin={hasDay ? cap.spareMin : 0}
        pullIn={q.state === "empty" ? [{ task: fixture.tasks[0] ?? todayFixture().tasks[1], source: "inbox" }] : []}
        onExpandCarried={said("expand")}
        onClearSlate={said("clear the slate")}
        onAllTomorrow={said("all to tomorrow")}
        onAllSomeday={said("all to someday")}
        eveningOpen={eveningOpen}
        onEveningToggle={setEveningOpen}
        done={past || q.state === "done" ? <DoneSection label="Done" tasks={fixture.done} older={null} onReopen={past ? null : said("reopen")} ctx={rowContext} /> : null}
        defaultEstimateMin={35}
        blocksByTask={fixture.blocksByTask}
        projectNames={fixture.projectNames}
        onComplete={said("complete")}
        onToday={said("today")}
        onTomorrow={said("tomorrow")}
        onSomeday={said("someday")}
        onDrop={said("drop")}
        onConvert={said("convert to project")}
        onMoveUp={said("move up")}
        onMoveDown={said("move down")}
        onBlock={
          hasDay
            ? (task) => {
                setPlacing(task.title);
                setMode("day");
              }
            : undefined
        }
        onMenu={said("menu")}
        bottomRoom={88}
      />
      {mode === "list" && (
        <View style={{ position: "absolute", right: 20, bottom: 20, width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.ink }}>
          <Icon name="plus" size={26} color={c.paper} strokeWidth={2} />
        </View>
      )}
    </View>
  );
}
