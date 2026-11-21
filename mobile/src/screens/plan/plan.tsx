// The morning plan on the phone (SCREENS.md §14; the web's is app/(app)/plan/page.tsx), wired to the day: the frame
// comes from the capacity engine, the picker's groups are frozen when the flow opens, every tick writes at once
// through the shared task repository (which records its own undo), step 3 blocks with Today's own timeline and
// placing (today/day-pane.tsx), Plan my day is the same preview as Today's inside the step, and Done stamps
// day_plans.planned_at. Every rule is the web's, used as it is: the day (useToday), the groups, what fits and what
// is on today (morning-plan.ts), tomorrow's spare time, the asks. The drawing is plan-view.tsx.
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { eveningStartMin } from "@/core/capacity/evening";
import type { Task } from "@/core/types";
import { toTask } from "@/data/mappers";
import { useLocalDatabase, useQuery, useSyncStatus } from "@/data/powersync";
import { OPEN_TASKS_SQL } from "@/data/queries/views";
import { DayPlanRepo } from "@/data/repositories/day-plan-repo";
import type { TaskRow } from "@/data/schema.client";
import { dayPart } from "@/features/looks/look";
import { usePlanPreviewState } from "@/features/planning/use-plan-preview-state";
import { candidates, fitsToday, onTodayTasks, type Candidates } from "@/features/rituals/morning-plan";
import { useTomorrowSpare } from "@/features/rituals/use-tomorrow-spare";
import { useRecordAsks } from "@/features/rollover/use-carry-asks";
import { useNow } from "@/features/shell/use-local-day";
import { minuteFromDay, minuteOnDay } from "@/features/today/day-minute";
import { useToday } from "@/features/today/hooks/use-today";
import { font, useColours } from "~/ui/theme";
import { PlanMyDay } from "../plan-my-day/plan-preview";
import { DayPane } from "../today/day-pane";
import { ribbonShape } from "../today/ribbon-shape";
import { MorningPlanView } from "./plan-view";

const USER_SQL = `select id, personal_space_id from users limit 1`;
/** Where the plan goes back to: Today. */
const TODAY = "/";

export function MorningPlan() {
  const c = useColours();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const db = useLocalDatabase();
  const dayPlans = useMemo(() => new DayPlanRepo(db), [db]);
  const now = useNow();
  const model = useToday(now);
  const status = useSyncStatus();
  // Recorded once step 2 is on screen, where the asks are (PRODUCT_SPEC.md §8.3.4).
  const [asksSeen, setAsksSeen] = useState(false);
  useRecordAsks(model.freshAsks, model.markAsked, asksSeen);
  // Step 2's asks are Today's: the same two a day, the same seven-day memory.
  const asks = useMemo(() => new Set(model.carried.filter((t) => t.ask).map((t) => t.id)), [model.carried]);
  const tomorrow = model.today.add({ days: 1 });
  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const { data: openRows, isLoading: loadingOpen } = useQuery<TaskRow>(OPEN_TASKS_SQL);
  const open = useMemo(() => (openRows ?? []).map(toTask), [openRows]);
  const { spareMin: tomorrowSpareMin } = useTomorrowSpare(tomorrow, model.settings);
  // Step 3 offers Plan my day: the same preview as Today, inside the step.
  const planning = usePlanPreviewState();
  // The selected block and the task waiting for a tap, held here; the placing itself runs in the day pane.
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);

  // Freeze the groups the first time data is there, so rows stay put while choices are made. The query reports an
  // empty list while it loads, and on a fresh phone it answers with nothing until the first sync lands, so wait for
  // rows or a settled sync, or the picker freezes empty.
  const [frozen, setFrozen] = useState<Candidates | null>(null);
  const connecting = !status.connected && !status.lastSyncedAt;
  const syncing = Boolean(status.dataFlowStatus.uploading || status.dataFlowStatus.downloading);
  const settled = !connecting && !syncing;
  if (!frozen && !loadingOpen && model.ready && (open.length > 0 || settled)) setFrozen(candidates(open, model.today));
  const byId = useMemo(() => new Map(open.map((t) => [t.id, t])), [open]);
  const groups = useMemo<Candidates>(() => {
    const live = (list: Task[]) => list.map((t) => byId.get(t.id) ?? t).filter((t) => t.state === "inbox" || t.state === "active");
    const f = frozen ?? { carried: [], dueThisWeek: [], fromProjects: [] };
    return { carried: live(f.carried), dueThisWeek: live(f.dueThisWeek), fromProjects: live(f.fromProjects) };
  }, [byId, frozen]);
  // What Today lists: a task waiting for a later start date is not on today yet.
  const onToday = useMemo(() => onTodayTasks(open, model.today), [open, model.today]);

  if (!model.ready || !model.settings) {
    return (
      <View style={[styles.waiting, { backgroundColor: c.paper, paddingTop: insets.top + 24 }]}>
        <Text style={[styles.waitingText, { color: c.ink2 }]}>{status.connected ? "Getting your data…" : "Connecting…"}</Text>
      </View>
    );
  }
  const settings = model.settings;
  const zone = settings.timezone;
  // Step 2 starts from Today's spare figure: an ad-hoc block holds its time here as it does on Today.
  const cap = model.capacity;
  const hasDay = Boolean(cap && cap.state !== "no_work_day");
  const pickedIds = new Set(onToday.filter((t) => !t.evening).map((t) => t.id));
  const { minute: nowMin } = minuteOnDay(now, zone, model.today);
  const fitsMin = fitsToday(cap, model.blocks, pickedIds, nowMin);
  const user = users?.[0];
  // Step 3 blocks only what is picked for today: a row still waiting in step 2 is not a task the day holds.
  const findTask = (id: string) => onToday.find((t) => t.id === id);
  const dayStart = cap?.windows[0]?.start ?? 9 * 60;
  const dayEnd = cap?.windows[cap.windows.length - 1]?.end ?? 17 * 60;
  // While Plan my day is previewed, the gaps are what the proposal leaves and the plan's earlier blocks it replaces
  // are hidden; the "done by" marker belongs to the day as it is, so it steps aside.
  const drawing = planning.mode ? planning.drawing : null;
  const replacedIds = new Set(drawing?.replacedIds ?? []);
  const home = () => (router.canGoBack() ? router.back() : router.replace(TODAY));

  return (
    <MorningPlanView
      part={dayPart(now.toZonedDateTimeISO(zone).hour)}
      capacity={cap}
      ribbon={cap ? ribbonShape(cap, nowMin) : null}
      blocks={model.blocks}
      groups={groups}
      onToday={onToday}
      fitsMin={fitsMin}
      tomorrowSpareMin={tomorrowSpareMin}
      // Step 2's note names when the evening's own time starts: the end of the working day (PRODUCT_SPEC.md §9.1).
      eveningStartMin={eveningStartMin(cap?.windows ?? [], settings.eveningStartsAt)}
      defaultEstimateMin={settings.defaultEstimateMin}
      asks={asks}
      onAsksShown={() => setAsksSeen(true)}
      // The task becomes a project and is gone as a task: its project opens.
      onBreakDown={(id) => void model.repo.convertToProject(id).then((out) => out && router.push(`/project/${out.projectId}`))}
      today={model.today}
      onPick={(task, picked) => {
        if (picked) {
          void model.repo.reschedule(task.id, model.today);
          return;
        }
        // Unticking puts the task back on the day it had when the plan opened (the frozen list keeps it): a carried
        // task is carried again. last_carried_at is no guide, because the rollover stamps it with today.
        const was = frozen && [...frozen.carried, ...frozen.dueThisWeek, ...frozen.fromProjects].find((t) => t.id === task.id);
        if (was?.doDate && !was.doDate.equals(model.today)) void model.repo.reschedule(task.id, was.doDate);
        else void model.repo.update(task.id, { doDate: null });
      }}
      onCarry={(id, to) => {
        if (to === "today") void model.repo.reschedule(id, model.today);
        else if (to === "tomorrow") void model.repo.reschedule(id, tomorrow);
        else void model.repo.setState(id, to === "someday" ? "someday" : "dropped");
      }}
      onMoveToTomorrow={(id) => void model.repo.reschedule(id, tomorrow)}
      onEstimate={(id, minutes) => void model.repo.update(id, { estimateMin: minutes })}
      blocking={
        cap
          ? {
              // A day without working hours has no timeline to block on; the step says so.
              dayPane: !hasDay ? null : (
                <DayPane
                  c={drawing ? { ...cap, free: [...drawing.free], projectedFinish: null } : cap}
                  nowMin={nowMin}
                  nowShown
                  blocks={drawing ? model.blocks.filter((b) => !replacedIds.has(b.id)) : model.blocks}
                  proposed={drawing?.ghosts}
                  meetings={model.meetings}
                  dayStart={dayStart}
                  dayEnd={dayEnd}
                  bufferPct={settings.bufferPct}
                  // The step's own sentence says how blocks get here.
                  hint={false}
                  placing={{
                    day: model.today,
                    zone,
                    blocks: model.blocks,
                    free: cap.free,
                    dayStart,
                    dayEnd,
                    nowMinute: minuteFromDay(now, zone, model.today),
                    defaultEstimateMin: settings.defaultEstimateMin,
                    findTask,
                    tasks: onToday,
                    state: { selectedBlockId, setSelectedBlockId, placing: placingId, setPlacing: setPlacingId },
                  }}
                  onOpenTask={(id) => router.push(`/task/${id}`)}
                />
              ),
              placing: placingId !== null && findTask(placingId) !== undefined,
              onPlace: setPlacingId,
            }
          : undefined
      }
      onDone={() => {
        if (user?.personal_space_id) void dayPlans.upsert(model.today.toString(), { spaceId: user.personal_space_id, userId: user.id }, { plannedAt: new Date().toISOString() });
        home();
      }}
      // Skip leaves at any point, with every change already made intact.
      onSkip={home}
      planMyDay={{
        open: planning.mode !== null,
        onOpen: () => planning.open("plan"),
        preview: planning.mode ? <PlanMyDay mode={planning.mode} model={model} now={now} layout="inline" onDrawing={planning.setDrawing} onClose={planning.close} /> : null,
      }}
    />
  );
}

const styles = StyleSheet.create({
  waiting: { flex: 1, paddingHorizontal: 24 },
  waitingText: { fontFamily: font.medium, fontSize: 17 },
});
