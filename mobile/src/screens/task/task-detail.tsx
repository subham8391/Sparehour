// A task's detail on the phone (ANDROID_APP_SPEC.md §10, step 4), opened from any list at /task/<id> and wired to the
// phone's own database. Everything it reads and writes is the web app's own code, used as it is: the detail's data
// hook (features/tasks/use-task-detail.ts), the repositories that write and record their undo (TaskRepo, with the time
// block a timed task holds; the checklist's and the tags'; the series edits; how long it took), and what the
// estimates learned. The drawing is task-detail-view.tsx.
import { useLocalSearchParams, useRouter } from "expo-router";
import { suggestEstimate } from "@/core/estimates";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { duplicateTask } from "@/data/repositories/duplicate";
import type { SeriesRepo } from "@/data/repositories/series-repo";
import { setTook } from "@/data/repositories/took";
import { learnedIsOld } from "@/features/estimates/learned-store";
import { useLearned } from "@/features/estimates/use-learned";
import { dayPart } from "@/features/looks/look";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useChecklistRepo, useTagRepo } from "@/features/tasks/use-repos";
import { useTaskDetail } from "@/features/tasks/use-task-detail";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useUndoSink } from "@/features/undo/undo-context";
import { apiFetch } from "~/api";
import { TaskDetailView, TaskMissingView, TaskOpeningView } from "./task-detail-view";

/** The phone's way to the server for what the estimates learned: its own call, with the session's token (api.ts). */
const askServer: typeof fetch = (input, init) => apiFetch(String(input), init ?? {});

export function TaskDetail() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const router = useRouter();
  const repo = useTaskRepo();
  const db = useLocalDatabase() as LocalDatabase;
  const undo = useUndoSink();
  const checklistRepo = useChecklistRepo();
  const tagRepo = useTagRepo();
  // How the person's estimates run (DECISIONS.md, amendment 2026-11-15): said under the Estimate, taken with a tap.
  const learned = useLearned(askServer);
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const { task, row, missing, project, area, projects, areas, headings, checklist, tags, allTags, exceptions } = useTaskDetail(id);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!task) return missing ? <TaskMissingView onBack={back} /> : <TaskOpeningView />;
  const defaultEstimate = settings?.defaultEstimateMin ?? 30;
  // Series edits load with the recurrence engine (TaskRepo.series()), the first time one is used.
  const series = (edit: (s: SeriesRepo) => Promise<void>) => void repo.series().then(edit);
  return (
    <TaskDetailView
      task={task}
      projectName={project?.name ?? null}
      areaName={area?.name ?? null}
      projects={projects}
      areas={areas}
      headings={headings}
      onHeading={(headingId) => void repo.setHeading(task.id, headingId)}
      checklist={checklist}
      tags={tags}
      allTags={allTags}
      now={now}
      zone={zone}
      today={today}
      part={dayPart(now.toZonedDateTimeISO(zone).hour)}
      defaultEstimateMin={defaultEstimate}
      // A day or a time written here keeps the task's time block in step inside the repository (timed-block.ts).
      onPatch={(patch) => void repo.update(task.id, patch)}
      onChecklistAdd={(title, sortKey) => void checklistRepo.add(task.id, task.spaceId, title, sortKey)}
      onChecklistReorder={(itemId, sortKey) => void checklistRepo.reorder(itemId, sortKey)}
      onChecklistToggle={(itemId, done) => void checklistRepo.setDone(itemId, done)}
      onChecklistRename={(itemId, title) => void checklistRepo.rename(itemId, title)}
      onChecklistRemove={(itemId) => void checklistRepo.remove(itemId)}
      onTagAdd={(name) => void tagRepo.attach(task.id, task.spaceId, name)}
      onTagRemove={(tagId) => void tagRepo.detach(task.id, tagId)}
      // The repositories record the undo; the toast with Undo is the app's one (ui/undo-provider.tsx).
      onComplete={() => void repo.complete(task.id)}
      onReopen={() => void repo.reopen(task.id)}
      // Parked or dropped, the task leaves the list it was opened from, and the detail goes with it, as on the web.
      onSomeday={() => void repo.setState(task.id, "someday").then(back)}
      onDrop={() => void repo.setState(task.id, "dropped").then(back)}
      took={row?.actual_min ?? null}
      onTook={(minutes) => void setTook(db, undo, task.id, minutes).then(learnedIsOld)}
      usual={suggestEstimate(learned, task, defaultEstimate)?.minutes ?? null}
      // The task becomes a project and is gone as a task: the project takes this screen's place.
      onConvert={() => void repo.convertToProject(task.id).then((out) => out && router.replace(`/project/${out.projectId}`))}
      // A copy right after the task, which then opens over this one.
      onDuplicate={() => void duplicateTask(db, undo ?? undefined, task.id).then((copy) => copy && router.push(`/task/${copy}`))}
      exceptions={exceptions}
      onSeriesDay={(choice, change) => series((s) => (choice === "once" ? s.moveOnce(task.id, change) : s.changeRuleFrom(task.id, change)))}
      onChangeRule={(rule, mode) => series((s) => s.changeRule(task.id, rule, mode))}
      onSkipOccurrence={() => series((s) => s.skip(task.id))}
      onPause={(until) => series((s) => s.pause(task.id, until))}
      onResume={() => series((s) => s.resume(task.id))}
    />
  );
}
