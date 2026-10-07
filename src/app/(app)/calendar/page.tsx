"use client";
// Calendar (SCREENS.md §4): the time-first view. Today's timeline, one per day, at full width — Day · Work week ·
// Week, remembered on the device (`Cmd+1/2/3` in the installed app, the control and the palette everywhere) — with
// each day's date and capacity readout over it, today's unblocked tasks in a rail beside it, and blocking on any day
// that has not passed. `[` / `]` step a day in the Day mode and a week in the others; `T` with nothing selected, or
// "Today", comes back. The phone has the Day mode only (three days held sideways), the rail behind a `Tasks` button,
// and tap-to-schedule; the narrow band shows three days that scroll sideways, the medium one folds the weekend.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compareDates, localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { useQuery } from "@/data/powersync";
import { WEEK_START_SQL } from "@/data/queries/week";
import { CalendarGrid } from "@/features/calendar-view/calendar-grid";
import { setCalendarMode, type CalendarMode } from "@/features/calendar-view/calendar-mode";
import { setCalendarDay, useCalendarDayParam, useCalendarMode, useCalendarModeKeys } from "@/features/calendar-view/use-calendar-view";
import { CalendarRail, RailSheet, TasksButton } from "@/features/calendar-view/calendar-rail";
import { focusDay, rangeTitle, shownDays, shownMode, stepShown } from "@/features/calendar-view/grid";
import { useCalendarBand } from "@/features/calendar-view/use-calendar-band";
import { useCalendarDays } from "@/features/calendar-view/use-calendar-days";
import layout from "@/features/calendar-view/calendar.module.css";
import { registerViewKeys } from "@/features/commands/view-keys";
import { useListSelection } from "@/features/selection/selection-provider";
import { useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { loadDragAdapter } from "@/features/tasks/drag-adapter";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { pausedLine, useCalendarState } from "@/features/today/calendar-state";
import { daysAway, parseDay } from "@/features/today/day-address";
import { useToday, type BlockTask } from "@/features/today/hooks/use-today";
import { PlacingBar } from "@/features/today/timeline";
import { Button, buttonClass, iconButtonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { Segmented } from "@/ui/segmented";

const MODES: { value: CalendarMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "workweek", label: "Work week" },
  { value: "week", label: "Week" },
];

export default function CalendarPage() {
  const now = useNow();
  const model = useToday(now);
  const { today, settings } = model;
  const zone = settings?.timezone ?? "UTC";
  const detail = useTaskDetail();
  const mainRef = useRef<HTMLElement>(null);
  const band = useCalendarBand(mainRef);
  const mode = useCalendarMode();
  const shown = shownMode(mode, band);
  const { data: weekStartRows } = useQuery<{ week_start: number | null }>(WEEK_START_SQL);
  const weekStart = weekStartRows?.[0]?.week_start ?? 0;
  // The day the range is anchored on: today until `[` / `]` move it, kept in the address (`?day=`) like Today's.
  const anchorIso = parseDay(useCalendarDayParam())?.toString() ?? null;
  const todayIso = today.toString();
  const anchor = useMemo(() => localDate(anchorIso ?? todayIso), [anchorIso, todayIso]);
  const days = useMemo(() => shownDays(anchor, shown, weekStart), [anchor, shown, weekStart]);

  // The rows' drag adapter comes with the page, so a rail row can be dragged as soon as it is drawn.
  useEffect(() => void loadDragAdapter().catch(() => undefined), []);

  // ---- the rail: today's tasks without a block today (DECISIONS.md "Calendar rail in week modes")
  const todays = useMemo(() => [...model.todayTasks, ...model.eveningTasks], [model.todayTasks, model.eveningTasks]);
  const rail = useMemo(() => todays.filter((t) => !model.blocksByTask.has(t.id)), [todays, model.blocksByTask]);
  const known = useMemo(() => new Map<string, BlockTask>(todays.map((t) => [t.id, { title: t.title, state: t.state }])), [todays]);
  const findTask = useCallback((id: string): Task | undefined => todays.find((t) => t.id === id) ?? model.carried.find((t) => t.id === id), [todays, model.carried]);
  // J / K walk the rail where it is on screen; the sheet below the wide band is tapped, not walked.
  const sel = useListSelection(band === "wide" ? rail.map((t) => t.id) : []);

  const data = useCalendarDays({ days, today, now, settings, tasks: known });
  const { writes } = useCalendarState();
  const off = pausedLine(writes.off);

  // The selected block and the task waiting for a tap, shared by every day on screen. A step lets go of the block.
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const placingTask = placingId && !off ? findTask(placingId) : undefined;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  const rangeKey = `${days[0]}:${days.length}`;
  const [seenRange, setSeenRange] = useState(rangeKey);
  if (seenRange !== rangeKey) {
    setSeenRange(rangeKey);
    setSelectedBlockId(null);
  }

  // `[` / `]` and the arrows step a day, or a week; `T` with nothing selected and "Today" come back.
  // A step counts from the address, not from the last render, so a quickly repeated `]` never steps from one day twice.
  const step = (delta: 1 | -1) => {
    const from = parseDay(new URLSearchParams(window.location.search).get("day")) ?? today;
    const next = stepShown(from, shown, delta);
    setCalendarDay(next.equals(today) ? null : next.toString());
  };
  const home = () => setCalendarDay(null);
  const keys = useRef({ step, home, away: anchorIso !== null });
  useEffect(() => {
    keys.current = { step, home, away: anchorIso !== null };
  });
  useEffect(
    () =>
      registerViewKeys({
        prev: () => keys.current.step(-1),
        next: () => keys.current.step(1),
        home: () => keys.current.away && (keys.current.home(), true),
      }),
    [],
  );

  const wide = band === "wide";
  const multi = band !== "phone" && band !== "landscape";
  useCalendarModeKeys(multi);
  const unit = shown === "day" || shown === "three" ? "day" : "week";
  const stepButton = (delta: 1 | -1) => (
    <button
      type="button"
      aria-label={delta === 1 ? `Next ${unit}` : `Previous ${unit}`}
      title={delta === 1 ? `Next ${unit} (])` : `Previous ${unit} ([)`}
      onClick={() => step(delta)}
      className={iconButtonClass()}
    >
      <Icon name={delta === 1 ? "arrow-right" : "arrow-left"} size={16} />
    </button>
  );
  const pick = (id: string) => {
    setSheetOpen(false);
    setSelectedBlockId(null);
    setPlacingId(id);
  };

  // Nothing on any day shown: how blocks get there. A day that is still loading says nothing yet.
  const ready = data.days.every((d) => d.capacity !== null);
  const empty = ready && data.days.every((d) => d.blocks.length === 0 && d.meetings.length === 0);
  const focus = focusDay(days, today);
  const canBlock = !off && compareDates(days[days.length - 1], today) >= 0;

  return (
    <main ref={mainRef} className={cx(VIEW_COLUMN, "sm:max-w-none")}>
      <ViewHeader eyebrow={shown === "day" ? `Calendar · ${daysAway(anchor, today)}` : "Calendar"} title={rangeTitle(days, today)} />
      <div className="-mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {multi && <Segmented label="Calendar mode" value={mode} onChange={setCalendarMode} options={MODES} />}
        <div className="flex items-center">
          {stepButton(-1)}
          {stepButton(1)}
        </div>
        {anchorIso !== null && (
          <Button variant="link" size="compact" onClick={home} title="Back to today (T)">
            <Icon name="arrow-left" size={14} />
            Today
          </Button>
        )}
        {!wide && (
          <span className="ml-auto">
            <TasksButton count={rail.length} onOpen={() => setSheetOpen(true)} />
          </span>
        )}
      </div>

      {/* Blocking paused (PRODUCT_SPEC.md §10.3 rule 5): why no new block lands; Today's banner fixes it. */}
      {off && (
        <p role="note" className="-mt-2 rounded-lg bg-surface-2 px-3 py-2 text-body-sm text-pretty text-ink-2">
          {off}
        </p>
      )}
      {placingTask && <PlacingBar text={`Tap a time for “${placingTask.title}”`} onCancel={() => setPlacingId(null)} />}

      <div className={wide ? layout.wide : "flex flex-col"}>
        {wide && (
          <CalendarRail
            tasks={rail}
            today={today}
            selectedId={sel.selectedId}
            onSelect={sel.select}
            onOpen={detail.open}
            onDone={(id) => void model.repo.complete(id)}
            onBlock={off ? undefined : (id) => pick(id)}
          />
        )}
        <CalendarGrid
          days={data.days}
          band={band}
          today={today}
          now={now}
          zone={zone}
          defaultEstimateMin={settings?.defaultEstimateMin ?? 30}
          findTask={findTask}
          state={{ selectedBlockId, setSelectedBlockId, placing: placingId, setPlacing: setPlacingId }}
          focus={focus}
          off={off}
          onOpenTask={detail.open}
          unfolded={unfolded}
          onUnfold={() => setUnfolded(true)}
        />
      </div>

      {empty && canBlock && (
        <p className="-mt-2 text-body text-pretty text-ink-3">
          <span className="touch:hidden">Nothing on. Drag a task in, or drag on the grid to block time.</span>
          {/* The wide band has the rail, not the Tasks button, on a touch screen too (a tablet held sideways). */}
          <span className="hidden touch:block">
            {wide ? "Nothing on. Choose Block on a task, then tap a time, or tap the grid to block time." : "Nothing on. Tap Tasks for a task and then a time, or tap the grid to block time."}
          </span>
        </p>
      )}
      {model.settings && !data.connected && (
        <EmptyCard
          action={
            <Link href="/settings#calendar" className={buttonClass({ variant: "link" })}>
              Connect
            </Link>
          }
        >
          No calendar connected — your meetings would show here.
        </EmptyCard>
      )}
      {sheetOpen && <RailSheet tasks={rail} paused={off} onPick={pick} onClose={() => setSheetOpen(false)} />}
    </main>
  );
}
