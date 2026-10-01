// @vitest-environment jsdom
// The accessibility sweep (SYSTEM_DESIGN.md §11.5): every presentational
// surface of M1 renders with realistic content and axe finds nothing.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { localDate, localTime } from "@/core/time";
import type { Task } from "@/core/types";
import { Palette } from "@/features/commands/palette";
import { COMMANDS } from "@/features/commands/registry";
import { PushActionSheet } from "@/features/notifications/push-actions";
import { isoAt, planTask } from "@/features/planning/plan-input";
import { PlanPreview } from "@/features/planning/plan-preview";
import { QuickAdd } from "@/features/quickadd/quick-add";
import { CarryReviewSheet } from "@/features/rituals/carry-review-sheet";
import { MorningPlanFlow } from "@/features/rituals/morning-plan-flow";
import { ShutdownFlow } from "@/features/rituals/shutdown-flow";
import { SearchView } from "@/features/search/search-view";
import { SelectionProvider, useListSelection, useSelection } from "@/features/selection/selection-provider";
import { SettingsForm } from "@/features/settings/settings-form";
import { Sidebar } from "@/features/shell/sidebar";
import { syncChipModel } from "@/features/shell/sync-chip";
import { TabBar } from "@/features/shell/tab-bar";
import { InlineAdd } from "@/features/tasks/inline-add";
import { MoveActions } from "@/features/tasks/task-actions";
import { TaskDetailPanel } from "@/features/tasks/task-detail-panel";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { Ribbon } from "@/features/today/ribbon";
import { Timeline } from "@/features/today/timeline";
import { a11yViolations } from "@/test/axe";
import { NOW, TODAY, capacityFixture, taskFixture } from "@/test/fixtures";

const tasks: Task[] = [
  taskFixture("t1", "Draft the proposal", { estimateMin: 45, deadline: localDate("2026-09-20"), doTime: localTime("09:30"), priority: 3, carryCount: 2 }),
  taskFixture("t2", "Call Mum", { estimateMin: null, state: "inbox", doDate: null }),
  taskFixture("t3", "Water the plants", { evening: true }),
];
const projects = [
  { id: "p1", name: "Acme" },
  { id: "p2", name: "Website" },
];
const areas = [{ id: "a1", name: "Work", projects: [{ id: "p1", name: "Acme" }, { id: "p2", name: "Website" }] }];
const sync = syncChipModel({ online: true, connected: true, uploading: false, downloading: false, hasError: false, lastSyncedAt: new Date("2026-09-14T09:29:50Z"), pending: 0, now: new Date("2026-09-14T09:30:00Z") });
const noop = () => {};
/** Renders on its own (a second `main` on the page would be the test's fault, not the surface's). */
const check = async (ui: React.ReactElement) => {
  const { container } = render(ui);
  expect(await a11yViolations(container)).toEqual([]);
  cleanup();
};

function Rows({ ticked = false }: { ticked?: boolean }) {
  const sel = useListSelection(tasks.map((t) => t.id));
  const { toggleCheck } = useSelection();
  useEffect(() => {
    if (ticked) toggleCheck("t1");
  }, [ticked, toggleCheck]);
  return (
    <TaskList>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} draggable selected={sel.selectedId === t.id} onSelect={() => sel.select(t.id)} onOpen={noop} onDone={noop} onDropTask={noop} actions={<MoveActions onToday={noop} onTomorrow={noop} onSomeday={noop} onDrop={noop} />} />
      ))}
    </TaskList>
  );
}

describe("axe: every M1 surface", () => {
  it("task rows, with and without multi-select", async () => {
    await check(
      <SelectionProvider>
        <Rows />
      </SelectionProvider>,
    );
    await check(
      <SelectionProvider>
        <Rows ticked />
      </SelectionProvider>,
    );
  }, 20_000);

  it("the task detail panel", async () => {
    await check(
      <TaskDetailPanel
        task={tasks[0]}
        projectName="Acme"
        areaName="Work"
        projects={projects}
        checklist={[{ id: "c1", taskId: tasks[0].id, title: "Outline", done: true, sortKey: "a0" }]}
        tags={[{ id: "g1", name: "deep" }]}
        allTags={[{ id: "g1", name: "deep" }, { id: "g2", name: "writing" }]}
        now={NOW}
        zone="Europe/London"
        today={TODAY}
        onPatch={noop}
        onComplete={noop}
        onReopen={noop}
        onSomeday={noop}
        onDrop={noop}
        onBlock={noop}
        onClose={noop}
      />,
    );
  }, 20_000);

  it("the ribbon and the timeline with blocks", async () => {
    await check(<Ribbon c={capacityFixture} />);
    await check(
      <Timeline
        c={capacityFixture}
        now={NOW}
        zone="UTC"
        blocks={[
          { id: "b1", taskId: tasks[0].id, title: "Draft the proposal", start: 585, end: 630, locked: false },
          { id: "b2", taskId: null, title: "Deep work", start: 780, end: 870, locked: true },
        ]}
        selectedBlockId="b1"
        onSelectBlock={noop}
        onDropTask={noop}
        onMoveBlock={noop}
        onResizeBlock={noop}
        onRemoveBlock={noop}
        onToggleLock={noop}
        onOpenTask={noop}
      />,
    );
  }, 20_000);

  it("quick-add, the palette and search", async () => {
    await check(<QuickAdd open projects={projects} ctx={{ now: NOW, zone: "Europe/London", today: TODAY }} onClose={noop} onSubmit={vi.fn().mockResolvedValue(undefined)} />);
    await check(
      <Palette
        open
        commands={COMMANDS}
        availability={(c) => (c.requiresSelection ? { enabled: false, reason: "select a task first" } : { enabled: true })}
        recents={["create.task"]}
        projects={[{ id: "p1", name: "Acme", href: "/project/p1" }]}
        areas={[{ id: "a1", name: "Work", href: "/area/a1" }]}
        tasks={tasks}
        today={TODAY}
        isMac
        onQueryChange={noop}
        onRun={noop}
        onOpenTask={noop}
        onGo={noop}
        onAddTask={noop}
        onClose={noop}
      />,
    );
    await check(
      <SearchView
        query="proposal"
        onQueryChange={noop}
        filters={{ project: "p1", tag: "deep" }}
        onFiltersChange={noop}
        projects={projects}
        areas={[{ id: "a1", name: "Work" }]}
        tags={[{ name: "deep" }]}
        searching={false}
        hits={[{ task: tasks[0], projectName: "Acme", context: { where: "notes", snippet: { before: "the ", match: "proposal", after: " draft" } } }]}
        alsoFound={[{ task: taskFixture("t9", "Old proposal", { state: "done" }), projectName: null, context: null }]}
        projectMatches={[{ id: "p2", name: "Proposal season", href: "/project/p2" }]}
        areaMatches={[]}
        today={TODAY}
        selectedId={null}
        onSelect={noop}
        onOpen={noop}
        onDone={noop}
        onAddTask={noop}
        onClose={noop}
      />,
    );
  }, 30_000);

  it("the shell: sidebar, rail and tab bar", async () => {
    await check(<Sidebar pathname="/today" counts={{ inbox: 3, today: 4 }} areas={areas} sync={sync} />);
    await check(<Sidebar rail pathname="/inbox" counts={{ inbox: 3, today: 4 }} areas={areas} sync={sync} />);
    await check(<TabBar pathname="/today" counts={{ inbox: 3, today: 4 }} />);
  }, 20_000);

  it("settings, with every panel", async () => {
    await check(
      <SettingsForm
        values={{ timezone: "Europe/London", weekStart: 0, dayRolloverHour: 4, bufferPct: 15, defaultEstimateMin: 30, carryAskAfter: 3, autoSomedayDays: 30, carryReview: true, eveningStartsAt: "18:00", theme: "system", notifyBlockStart: true, notifyDeadline: true, notifyMorning: true, notifyShutdown: false, morningNudgeTime: "08:30", shutdownNudgeTime: "", quietHoursStart: "21:30", quietHoursEnd: "07:30" }}
        workHours={[{ start: "09:00", end: "18:00" }, { start: "09:00", end: "18:00" }, { start: "09:00", end: "18:00" }, { start: "09:00", end: "18:00" }, { start: "09:00", end: "17:00" }, null, null]}
        detectedTimeZone="Asia/Kolkata"
        account={{ name: "Dev User", email: "dev@sparehour.local" }}
        app={{ install: { kind: "coach-ios", steps: ["Tap Share in Safari", "Choose “Add to Home Screen”"] }, persistence: "unprotected", version: "dev", onInstall: noop }}
        notifications={{ copy: { headline: "Reminders are off.", detail: "Your browser will ask once.", steps: [], action: "enable" }, subscribed: false, busy: false, error: null, onEnable: noop, onDisable: noop, onTest: noop, testResult: null }}
        data={{ onExport: noop, busy: null, error: null, lastFile: "sparehour-export-2026-09-14.json" }}
        onChange={noop}
        onWorkHours={noop}
        onSignOut={noop}
      />,
    );
  }, 20_000);

  it("the rituals and the notification sheet", async () => {
    await check(
      <ShutdownFlow
        done={[taskFixture("d1", "Reply to Priya", { state: "done", estimateMin: 15 })]}
        unfinished={[taskFixture("u1", "Book dentist", { estimateMin: 10 })]}
        defaultEstimateMin={30}
        rating={null}
        highlight=""
        tomorrow={{ spareMin: 250, planned: 3 }}
        onCarry={noop}
        onCarryAll={noop}
        onRating={noop}
        onHighlight={noop}
        onPlanTomorrow={noop}
        onClose={noop}
        onSkip={noop}
      />,
    );
    await check(
      <MorningPlanFlow
        capacity={capacityFixture}
        groups={{ carried: [taskFixture("c1", "Book dentist", { doDate: localDate("2026-09-11"), carryCount: 3, estimateMin: 10 })], dueThisWeek: [taskFixture("d1", "Write proposal", { deadline: localDate("2026-09-18"), estimateMin: 90 })], fromProjects: [taskFixture("p1", "Outline talk", { estimateMin: null })] }}
        onToday={[]}
        fitsMin={340}
        tomorrowSpareMin={250}
        defaultEstimateMin={30}
        carryAskAfter={3}
        today={TODAY}
        now={NOW}
        zone="Europe/London"
        onPick={noop}
        onCarry={noop}
        onMoveToTomorrow={noop}
        onDone={noop}
        onSkip={noop}
      />,
    );
    await check(<PushActionSheet link={{ kind: "block_start", taskId: "t1", blockId: "b1", action: null }} onPick={noop} onClose={noop} />);
    const noWrites = { reschedule: async () => {}, updateMany: async () => {}, setState: async () => {}, setStateMany: async () => {} };
    await check(
      <CarryReviewSheet
        tasks={[taskFixture("c1", "Book dentist", { doDate: localDate("2026-09-13"), carryCount: 3, estimateMin: 10 }), taskFixture("c2", "Renew the car insurance", { doDate: localDate("2026-09-11"), carryCount: 1, estimateMin: null })]}
        today={TODAY}
        repo={noWrites}
        onStamp={noop}
        onClose={noop}
      />,
    );
    await check(
      <TaskList>
        <InlineAdd ctx={{ now: NOW, zone: "Europe/London" }} onAdd={noop} placeholder="Add a task" />
      </TaskList>,
    );
  }, 30_000);

  it("the Plan my day preview, choosing which blocks to approve, and its ghosts on the timeline", async () => {
    const planWriter = { approve: async () => {}, tomorrow: noop, someday: noop, keep: noop };
    const base = {
      day: TODAY,
      capacity: { windows: [{ start: 540, end: 720 }], busy: [{ start: 600, end: 630 }] },
      blocks: [{ id: "b-old", taskId: "t2", start: 660, end: 690, locked: false, source: "plan" }],
      candidates: [
        planTask(taskFixture("t1", "Draft the proposal", { priority: 3, estimateMin: 45, carryCount: 2 }), TODAY),
        planTask(taskFixture("t2", "Review the deck", { estimateMin: 180 }), TODAY),
        planTask(taskFixture("t3", "Reorganise the shared drive", { estimateMin: 90 }), TODAY),
      ],
      settings: { timezone: "UTC", maxBlockMin: 90, minBlockMin: 25, defaultEstimateMin: 30, eveningStartsAt: localTime("18:00"), bufferPct: 15 },
      now: NOW.subtract({ minutes: 90 }),
    };
    for (const layout of ["dock", "inline"] as const) {
      const { container } = render(<PlanPreview mode="plan" base={base} blockTitles={new Map([["b-old", "Review the deck"]])} layout={layout} writer={planWriter} toIso={(m) => isoAt(TODAY, m, "UTC")} onClose={noop} />);
      expect(await a11yViolations(container)).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Approve some" }));
      fireEvent.click(screen.getByRole("button", { name: "Remove Draft the proposal from the plan" }));
      expect(await a11yViolations(container)).toEqual([]);
      cleanup();
    }
    await check(<Timeline c={capacityFixture} now={NOW} zone="UTC" proposed={[{ key: "t1", title: "Draft the proposal", start: 690, end: 735 }, { key: "t2:1", title: "Review the deck (1 of 2)", start: 780, end: 870 }]} />);
  }, 30_000);
});
