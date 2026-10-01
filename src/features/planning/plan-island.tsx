"use client";
// The Plan my day preview, wired to the local database: the task ages and the
// days ahead for the score, the block repository for Approve (one transaction,
// one undo entry, then the push-after-write path to Google like any block),
// and the task repository for Didn't fit's Tomorrow and Someday. Loaded as a
// next/dynamic island so the scheduler stays out of Today's first download.
import { useQuery } from "@/data/powersync";
import { normaliseTimestamp, toCapacityBlock, toCapacityEvent, toWorkWindow } from "@/data/mappers";
import { BLOCKS_AROUND_SQL, CALENDARS_SQL, EVENTS_AROUND_SQL, TASK_AGES_THROUGH_TODAY_SQL, WORK_HOURS_SQL } from "@/data/queries/today";
import type { CalendarEventRow, TimeBlockRow, WorkHoursRow } from "@/data/schema.client";
import { instant, type Instant, type LocalDate } from "@/core/time";
import { useBlockRepo } from "@/features/blocking/use-block-repo";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import type { PlanDrawing, PlanMode } from "./drawing";
import { aheadDays, aheadThrough, candidateTasks, isoAt, planInputFrom, type PlanModel } from "./plan-input";
import { PlanPreview, type PlanWriter } from "./plan-preview";

const USER_SQL = `select id, personal_space_id from users limit 1`;

export interface PlanIslandProps {
  mode: PlanMode;
  model: PlanModel;
  now: Instant;
  layout: "dock" | "inline";
  onDrawing?: (drawing: PlanDrawing | null) => void;
  onClose: () => void;
}

export function PlanIsland({ mode, model, now, layout, onDrawing, onClose }: PlanIslandProps) {
  const zone = model.settings?.timezone ?? "UTC";
  const today = model.today;
  const tomorrow = today.add({ days: 1 });
  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const { data: ageRows } = useQuery<{ id: string; created_at: string | null }>(TASK_AGES_THROUGH_TODAY_SQL, [today.toString()]);
  const tasks = candidateTasks(model);
  const through = aheadThrough(today, tasks);
  // The days between today and the furthest deadline (at most two weeks), for deadline pressure.
  const aheadRange = [tomorrow.subtract({ days: 1 }).toString(), (through ?? tomorrow).add({ days: 1 }).toString()];
  const { data: workRows } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const { data: eventRows } = useQuery<CalendarEventRow>(EVENTS_AROUND_SQL, aheadRange);
  const { data: blockRows } = useQuery<TimeBlockRow>(BLOCKS_AROUND_SQL, aheadRange);
  const { data: calendarRows } = useQuery<{ id: string; read: number | null }>(CALENDARS_SQL);
  const blocks = useBlockRepo();
  const taskRepo = useTaskRepo();

  const ages = new Map<string, LocalDate>();
  for (const r of ageRows ?? []) if (r.created_at) ages.set(r.id, instant(normaliseTimestamp(r.created_at)).toZonedDateTimeISO(zone).toPlainDate());
  const readByCalendar = new Map((calendarRows ?? []).map((c) => [c.id, c.read !== 0]));
  const ahead =
    through && model.settings
      ? aheadDays({
          today,
          through,
          settings: model.settings,
          workHours: (workRows ?? []).map(toWorkWindow).filter((w): w is NonNullable<typeof w> => w !== null),
          events: (eventRows ?? []).map((e) => toCapacityEvent(e, readByCalendar.get(e.calendar_id ?? "") ?? true)),
          blocks: (blockRows ?? []).map(toCapacityBlock).filter((b): b is NonNullable<typeof b> => b !== null),
        })
      : [];
  const base = planInputFrom(model, { now, ages, ahead });

  const user = users?.[0];
  const writer: PlanWriter = {
    approve: async (chosen, replaces) => {
      if (!user?.personal_space_id) throw new Error("no account yet");
      await blocks.approvePlan({ spaceId: user.personal_space_id, userId: user.id, blocks: chosen, replaces });
    },
    tomorrow: (id) => taskRepo.reschedule(id, tomorrow),
    someday: (id) => taskRepo.setState(id, "someday"),
    keep: (id) => blocks.setLocked(id, true),
  };

  return (
    <PlanPreview
      mode={mode}
      base={base}
      blockTitles={new Map(model.blocks.map((b) => [b.id, b.title]))}
      layout={layout}
      writer={writer}
      toIso={(minute) => isoAt(today, minute, zone)}
      onDrawing={onDrawing}
      onClose={onClose}
    />
  );
}
