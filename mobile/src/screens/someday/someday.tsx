// Someday on the phone (ANDROID_APP_SPEC.md §10; the web's app/(app)/someday/page.tsx), wired to the phone's own
// database. The statement, the grouping, the once-only announcement and the picker's days are the web's own, and
// every answer is a write through the shared task repository, which records its undo for the app's one toast
// ("Keep in Someday" clears a server-owned stamp and has nothing to undo, as on the web). What every row's ⋯, its
// swipes and the bulk bar do is the screen's frame (rows/rows.tsx). The drawing is someday-view.tsx and
// someday-sheets.tsx.
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { somedayGroups } from "@/app/(app)/someday/someday-groups";
import { instant, localDate, type LocalDate } from "@/core/time";
import { formatDay, weekdayName } from "@/core/time/format-day";
import { normaliseTimestamp, toTask } from "@/data/mappers";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { ALL_PROJECTS_SQL, AREAS_SQL, type AreaRow, type ProjectStateRow } from "@/data/queries/nav";
import { SOMEDAY_SQL } from "@/data/queries/views";
import { SomedayRepo } from "@/data/repositories/rollover-repo";
import type { TaskRow } from "@/data/schema.client";
import { useAnnouncement } from "@/features/rollover/use-announcement";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { pickerDayName, pickerDays } from "@/features/tasks/picker-days";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Rows, useBreakDown } from "../rows/rows";
import { SomedayReview, type PickDay } from "./someday-sheets";
import { SomedayView } from "./someday-view";

export function Someday() {
  const router = useRouter();
  const repo = useTaskRepo();
  const db = useLocalDatabase();
  const breakDown = useBreakDown();
  const now = useNow();
  const { today, settings, zone } = useLocalDay(now);
  const { data, isLoading } = useQuery<TaskRow>(SOMEDAY_SQL);
  const { data: areas } = useQuery<AreaRow>(AREAS_SQL);
  const { data: projects } = useQuery<ProjectStateRow>(ALL_PROJECTS_SQL);
  const groups = useMemo(() => somedayGroups(data ?? [], areas ?? [], projects ?? []), [data, areas, projects]);
  const shown = useMemo(() => ({ autoFiled: groups.autoFiled.map(toTask), projects: groups.projects.map((g) => ({ ...g, tasks: g.tasks.map(toTask) })), loose: groups.loose.map(toTask) }), [groups]);
  const projectNames = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name ?? "Untitled project"])), [projects]);
  const stamps = useMemo(() => groups.autoFiled.map((t) => t.auto_filed_at), [groups.autoFiled]);
  const announcement = useAnnouncement("autoFiled", stamps);

  const todayIso = today.toString();
  // By its date: the day object is a new one each minute, the day is not.
  const days = useMemo<PickDay[]>(() => {
    const first = localDate(todayIso);
    return pickerDays(first).map((day) => {
      const name = pickerDayName(day, first);
      const date = `${weekdayName(day)} ${day.day}`;
      return { day, name, date: name === date ? undefined : date };
    });
  }, [todayIso]);

  // The walk is over the batch as it was when it opened: each answer takes a task out of the live group.
  const [batch, setBatch] = useState<readonly TaskRow[] | null>(null);
  const [index, setIndex] = useState(0);
  const [reviewStep, setReviewStep] = useState<"ask" | "days">("ask");
  const review = () => {
    announcement.dismiss();
    setBatch([...groups.autoFiled]);
    setIndex(0);
    setReviewStep("ask");
  };
  const asked = batch?.[index] ?? null;
  const answer = (run: (id: string) => Promise<void>) => () => {
    if (!asked) return;
    setReviewStep("ask");
    void run(asked.id).then(() => setIndex((i) => i + 1));
  };
  const touched = asked?.last_touched_at ? instant(normaliseTimestamp(asked.last_touched_at)).toZonedDateTimeISO(zone).toPlainDate() : null;
  const line = [asked?.project_id ? projectNames.get(asked.project_id) : null, touched ? `Last touched ${formatDay(touched, { today })}` : null].filter(Boolean).join(" · ");

  return (
    <Rows>
      <SomedayView
        today={today}
        defaultEstimateMin={settings?.defaultEstimateMin ?? 30}
        empty={!isLoading && (data ?? []).length === 0}
        autoFiled={shown.autoFiled}
        projects={shown.projects}
        loose={shown.loose}
        projectNames={projectNames}
        autoSomedayDays={settings?.autoSomedayDays ?? 30}
        announced={announcement.count}
        onReview={review}
        onDismiss={announcement.dismiss}
        onBringAllBack={() =>
          void repo.setStateMany(
            groups.autoFiled.map((t) => t.id),
            "active",
            "Brought back {title}",
          )
        }
        onComplete={(task) => void repo.complete(task.id)}
        onOpen={(task) => router.push(`/task/${task.id}`)}
        onToday={(task) => void repo.reschedule(task.id, today)}
        onBackToActive={(task) => void repo.setState(task.id, "active", "Brought back {title}")}
        onDrop={(task) => void repo.setState(task.id, "dropped")}
        onBreakDown={(task) => breakDown(task.id)}
      />
      <SomedayReview
        open={batch !== null}
        task={asked ? { id: asked.id, title: asked.title ?? "Untitled" } : null}
        position={batch && asked ? `${index + 1} of ${batch.length}` : ""}
        line={line}
        step={reviewStep}
        today={today}
        days={days}
        onKeep={answer((id) => new SomedayRepo(db).keep([id]))}
        onToday={answer((id) => repo.reschedule(id, today))}
        onPickADate={() => setReviewStep("days")}
        onPickDay={(day: LocalDate) => answer((id) => repo.reschedule(id, day))()}
        onDrop={answer((id) => repo.setState(id, "dropped"))}
        onClose={() => setBatch(null)}
      />
    </Rows>
  );
}
