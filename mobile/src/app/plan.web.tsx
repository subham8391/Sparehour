// The browser preview of the morning plan (npm run preview, /plan): the real views, a made-up morning (screens/plan/
// plan-fixture.ts). It opens on the first step; `?step=pick` and `?step=block` show the others, `?state=over` a
// morning with more picked than fits (the coach names its easiest move), `?state=off` a day without working hours,
// `?ask=1` the three-carry ask on a carried row, `?plan=1` Plan my day's preview open in the last step, and
// `?placing=1` a task waiting for a tap on the timeline. Ticks, moves and estimates change the made-up morning on
// the page, so the readout follows; nothing is saved. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import type { ZoomStep } from "@/core/blocking";
import type { Task } from "@/core/types";
import { sameDrawing, type PlanDrawing } from "@/features/planning/drawing";
import { PLAN_STEPS, type PlanStep } from "@/features/rituals/morning-plan";
import { PlanPreviewPanel } from "~/screens/plan-my-day/plan-preview-view";
import { planFixture } from "~/screens/plan/plan-fixture";
import { MorningPlanView } from "~/screens/plan/plan-view";
import { TimelineView } from "~/screens/today/timeline-view";
import { NOW_MIN, TODAY } from "~/screens/today/today-fixture";

const said = (what: string) => () => console.log(`[preview] ${what}`);

export default function Preview() {
  const q = useLocalSearchParams<{ step?: string; state?: string; ask?: string; plan?: string; placing?: string }>();
  const fixture = planFixture({ state: q.state === "over" ? "over" : q.state === "off" ? "off" : "open" });
  const step = (PLAN_STEPS as readonly string[]).includes(q.step ?? "") ? (q.step as PlanStep) : "frame";
  const all = [...fixture.groups.carried, ...fixture.groups.dueThisWeek, ...fixture.groups.fromProjects];
  // What was ticked, moved away or given an estimate on this page.
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [gone, setGone] = useState<readonly string[]>([]);
  const [estimates, setEstimates] = useState<Record<string, number>>({});
  const [planOpen, setPlanOpen] = useState(q.plan === "1");
  const [drawing, setDrawingState] = useState<PlanDrawing | null>(null);
  // The panel tells its drawing on every render; it is kept only when it paints differently, as the screens do.
  const setDrawing = (next: PlanDrawing | null) => setDrawingState((prev) => (sameDrawing(prev, next) ? prev : next));
  const [placing, setPlacing] = useState<string | null>(q.placing === "1" ? "t3" : null);
  const [zoom, setZoom] = useState<ZoomStep>(30);
  const [selected, setSelected] = useState<string | null>(null);
  const withEstimate = (t: Task): Task => (estimates[t.id] ? { ...t, estimateMin: estimates[t.id] } : t);
  const live = (list: Task[]) => list.filter((t) => !gone.includes(t.id)).map(withEstimate);
  const onToday = [...fixture.onToday.filter((t) => !gone.includes(t.id)), ...all.filter((t) => picked.includes(t.id) && !gone.includes(t.id))].map(withEstimate);
  const cap = fixture.day.capacity;
  const hasDay = cap.state !== "no_work_day";
  const replaced = new Set(planOpen ? (drawing?.replacedIds ?? []) : []);
  return (
    <MorningPlanView
      key={`${step}${q.state}`}
      initialStep={step}
      capacity={cap}
      ribbon={fixture.ribbon}
      blocks={fixture.day.blocks}
      groups={{ carried: live(fixture.groups.carried), dueThisWeek: live(fixture.groups.dueThisWeek), fromProjects: live(fixture.groups.fromProjects) }}
      onToday={onToday}
      fitsMin={fixture.fitsMin}
      tomorrowSpareMin={fixture.tomorrowSpareMin}
      eveningStartMin={18 * 60}
      defaultEstimateMin={35}
      asks={q.ask === "1" ? fixture.asks : new Set()}
      today={TODAY}
      onBreakDown={said("break it down")}
      onPick={(task, on) => setPicked((ids) => (on ? [...ids, task.id] : ids.filter((id) => id !== task.id)))}
      onCarry={(id, to) => (to === "today" ? setPicked((ids) => [...ids, id]) : setGone((ids) => [...ids, id]))}
      onMoveToTomorrow={(id) => setGone((ids) => [...ids, id])}
      onEstimate={(id, minutes) => setEstimates((e) => ({ ...e, [id]: minutes }))}
      onDone={said("done: the day is marked planned")}
      onSkip={said("skip")}
      planMyDay={{
        open: planOpen,
        onOpen: () => setPlanOpen(true),
        preview: (
          <PlanPreviewPanel
            mode="plan"
            base={fixture.planInput}
            layout="inline"
            writer={{ approve: async () => said("approve")(), tomorrow: said("tomorrow"), someday: said("someday"), keep: said("keep") }}
            toIso={(minute) => String(minute)}
            onDrawing={setDrawing}
            onClose={() => setPlanOpen(false)}
          />
        ),
      }}
      blocking={{
        dayPane: hasDay ? (
          <TimelineView
            // While the plan is previewed the gaps are what it leaves, and the blocks it replaces are hidden.
            c={planOpen && drawing ? { ...cap, free: [...drawing.free], projectedFinish: null } : cap}
            nowMin={NOW_MIN}
            nowShown
            blocks={fixture.day.blocks.filter((b) => !replaced.has(b.id))}
            meetings={fixture.day.meetings}
            zoom={zoom}
            onZoom={setZoom}
            dayStart={9 * 60}
            dayEnd={18 * 60}
            bufferPct={15}
            selectedBlockId={selected}
            onSelectBlock={setSelected}
            onMoveBlock={said("move block")}
            onResizeBlock={said("resize block")}
            onDuplicateBlock={said("duplicate block")}
            onRemoveBlock={said("remove block")}
            onToggleLock={said("lock")}
            onRenameBlock={said("rename block")}
            onOpenTask={said("open task")}
            onAddBlock={said("add block")}
            addable={fixture.day.addable}
            placing={placing ? { title: onToday.find((t) => t.id === placing)?.title ?? "Review the budget" } : null}
            onTapSlot={() => setPlacing(null)}
            onCancelPlacing={() => setPlacing(null)}
          />
        ) : null,
        placing: placing !== null,
        onPlace: setPlacing,
      }}
    />
  );
}
