"use client";
// Someday (SCREENS.md §7): the guilt-free parking lot, explicitly not a
// backlog you are behind on. What the rollover filed on its own is pinned at
// the top with Review and Bring them all back, announced once per batch; the
// rest is grouped by project, loose tasks last. Every row offers Today ·
// Pick a date · Back to active · Drop, each undoable; on a phone they are in
// the row's ⋯ menu. No counts in the sidebar, no age shaming.
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { toTask } from "@/data/mappers";
import { ALL_PROJECTS_SQL, AREAS_SQL, type AreaRow, type ProjectStateRow } from "@/data/queries/nav";
import { SOMEDAY_SQL } from "@/data/queries/views";
import type { TaskRow as TaskRowType } from "@/data/schema.client";
import { useAnnouncement } from "@/features/rollover/use-announcement";
import { useListSelection } from "@/features/selection/selection-provider";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { RowAction } from "@/features/tasks/task-actions";
import { useTaskDetail } from "@/features/tasks/task-detail";
import { TaskList, TaskRow } from "@/features/tasks/task-row";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Button, iconButtonClass } from "@/ui/button";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { SectionLabel } from "@/ui/section-label";
import { PickDateSheet } from "./pick-date-sheet";
import { somedayGroups } from "./someday-groups";

// The walk is fetched when Review is first pressed, not with the page.
const SomedayReview = dynamic(() => import("./someday-review").then((m) => m.SomedayReview), { ssr: false });

const tasksWord = (n: number) => (n === 1 ? "1 task" : `${n} tasks`);

export default function SomedayPage() {
  const repo = useTaskRepo();
  const detail = useTaskDetail();
  const now = useNow();
  const { today, settings, zone } = useLocalDay(now);
  const { data, isLoading } = useQuery<TaskRowType>(SOMEDAY_SQL);
  const { data: areas } = useQuery<AreaRow>(AREAS_SQL);
  const { data: projects } = useQuery<ProjectStateRow>(ALL_PROJECTS_SQL);
  const groups = useMemo(() => somedayGroups(data ?? [], areas ?? [], projects ?? []), [data, areas, projects]);
  const projectNames = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name ?? "Untitled project"])), [projects]);
  const sel = useListSelection([groups.autoFiled.map((t) => t.id), ...groups.projects.map((g) => g.tasks.map((t) => t.id)), groups.loose.map((t) => t.id)]);

  const stamps = useMemo(() => groups.autoFiled.map((t) => t.auto_filed_at), [groups.autoFiled]);
  const announcement = useAnnouncement("autoFiled", stamps);
  const [reviewing, setReviewing] = useState(false);
  const [picking, setPicking] = useState<TaskRowType | null>(null);
  const review = () => {
    announcement.dismiss();
    setReviewing(true);
  };
  const days = settings?.autoSomedayDays ?? 30;

  const row = (r: TaskRowType, inProject: boolean) => {
    const t = toTask(r);
    return (
      <TaskRow
        key={t.id}
        task={t}
        today={today}
        onOpen={() => detail.open(t.id)}
        selected={sel.selectedId === t.id}
        onSelect={() => sel.select(t.id)}
        onDone={() => void repo.complete(t.id)}
        meta={!inProject && t.projectId && projectNames.has(t.projectId) && <span>{projectNames.get(t.projectId)}</span>}
        actions={
          <>
            <RowAction label="Today" primary title="Today (T)" onClick={() => void repo.reschedule(t.id, today)} />
            <RowAction label="Pick a date" icon="calendar" text={null} title="Pick a date" onClick={() => setPicking(r)} />
            <RowAction label="Back to active" onClick={() => void repo.setState(t.id, "active", "Brought back {title}")} />
            <RowAction label="Drop" title="Drop (Backspace)" onClick={() => void repo.setState(t.id, "dropped")} />
          </>
        }
      />
    );
  };

  const empty = !isLoading && (data ?? []).length === 0;
  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Someday" title="Things you&rsquo;re not doing right now." subtitle="That&rsquo;s allowed." />
      {announcement.count > 0 && (
        <p role="status" className="-mt-2 flex items-center gap-1 rounded-xl border border-line bg-surface py-1 pr-1 pl-4 text-body-sm text-ink-2">
          <span className="min-w-0 flex-1 text-pretty">
            {tasksWord(announcement.count)} moved to Someday while you weren&rsquo;t looking
          </span>
          <Button variant="link" size="compact" onClick={review}>
            Review
          </Button>
          <button type="button" aria-label="Dismiss" onClick={announcement.dismiss} className={iconButtonClass({ size: "compact" })}>
            <Icon name="close" size={14} />
          </button>
        </p>
      )}
      {empty ? (
        <div className="flex flex-col gap-3">
          <Icon name="moon" size={20} className="text-ink-3" />
          <EmptyCard fact="Nothing parked. That&rsquo;s fine too." />
        </div>
      ) : (
        <>
          {groups.autoFiled.length > 0 && (
            <section aria-label="Moved here automatically" className="flex flex-col gap-2">
              <SectionLabel className="px-0.5" count={groups.autoFiled.length}>
                Moved here automatically
              </SectionLabel>
              {/* On a phone the sentence keeps its line and the two actions wrap below it together. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5">
                <p className="min-w-48 flex-1 text-body-sm text-ink-2">You hadn&rsquo;t touched these in {days} days.</p>
                <div className="flex items-center gap-2">
                  <Button variant="link" size="compact" onClick={review}>
                    Review
                  </Button>
                  <Button
                    variant="link"
                    size="compact"
                    onClick={() =>
                      void repo.setStateMany(
                        groups.autoFiled.map((t) => t.id),
                        "active",
                        "Brought back {title}",
                      )
                    }
                  >
                    Bring them all back
                  </Button>
                </div>
              </div>
              <TaskList>{groups.autoFiled.map((r) => row(r, false))}</TaskList>
            </section>
          )}
          {groups.projects.map((g) => (
            <section key={g.projectId} aria-label={g.name} className="flex flex-col gap-2">
              <SectionLabel className="px-0.5" count={g.tasks.length} detail={g.area ?? undefined}>
                {g.name}
              </SectionLabel>
              <TaskList>{g.tasks.map((r) => row(r, true))}</TaskList>
            </section>
          ))}
          {groups.loose.length > 0 && (
            <section aria-label="Not in a project" className="flex flex-col gap-2">
              <SectionLabel className="px-0.5" count={groups.loose.length}>
                Not in a project
              </SectionLabel>
              <TaskList>{groups.loose.map((r) => row(r, false))}</TaskList>
            </section>
          )}
        </>
      )}
      {reviewing && <SomedayReview tasks={groups.autoFiled} today={today} zone={zone} projectNames={projectNames} onClose={() => setReviewing(false)} />}
      {picking && <PickDateSheet title={picking.title ?? "this task"} today={today} onPick={(day) => void repo.reschedule(picking.id, day)} onClose={() => setPicking(null)} />}
    </main>
  );
}
