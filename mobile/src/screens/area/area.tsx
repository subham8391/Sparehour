// An area's page on the phone (ANDROID_APP_SPEC.md §9; the web's app/(app)/area/[id]/page.tsx), at /area/<id> and
// wired to the phone's own database. What it reads is the web page's own hook (features/projects/use-area-page.ts);
// a card's figures, its bar and its deadline, and the sentence the delete asks with, are the web's (page-rules.ts,
// data/queries/area.ts, organise-place.ts); a new task is read by the shared quick-add parser and filed in the area
// by the shared repository; and every write goes through the shared repositories, which record the undo the app's
// one toast offers. The drawing is area-view.tsx.
import { useLocalSearchParams, useRouter } from "expo-router";
import { localDate } from "@/core/time";
import { useQuery } from "@/data/powersync";
import { weekProgress } from "@/data/queries/area";
import { dayPart } from "@/features/looks/look";
import { AREA_CONTENTS_SQL, deleteAreaNote } from "@/features/projects/organise-place";
import { cardDeadline, cardFigures, projectsWord } from "@/features/projects/page-rules";
import { useAreaPage } from "@/features/projects/use-area-page";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { keyForStep } from "@/features/tasks/checklist-order";
import { useAreaRepo, useProjectRepo } from "@/features/tasks/use-repos";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useQuickAdd } from "../quick-add/quick-add";
import { Rows } from "../rows/rows";
import { AreaMissingView, AreaOpeningView, AreaView, type AreaCard } from "./area-view";

export function AreaPage() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "";
  const router = useRouter();
  const areas = useAreaRepo();
  const projects = useProjectRepo();
  const tasks = useTaskRepo();
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const page = useAreaPage(id, today, settings?.defaultEstimateMin ?? 30);
  // What deleting the area leaves without one, for the confirmation's sentence.
  const { data: contents } = useQuery<{ projects: number; tasks: number }>(AREA_CONTENTS_SQL, [id]);
  // Adding a task here is the app's one quick add, opened in this area.
  const quickAdd = useQuickAdd();

  const { area } = page;
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/browse"));
  if (!page.isLoading && !area) return <AreaMissingView onBrowse={() => router.replace("/browse")} />;
  if (!area) return <AreaOpeningView />;

  const spaceId = area.space_id;
  const cards: AreaCard[] = (page.projects ?? []).map((p) => {
    const deadline = cardDeadline(p);
    return { id: p.id, name: p.name ?? "Untitled project", share: weekProgress(p.done_week, p.open_count), figures: cardFigures(p), deadline: deadline ? localDate(deadline) : null };
  });

  const name = area.name ?? "Untitled area";
  return (
    <Rows>
      <AreaView
        id={area.id}
        name={name}
        part={dayPart(now.toZonedDateTimeISO(zone).hour)}
        today={today}
        defaultEstimateMin={settings?.defaultEstimateMin ?? 30}
        count={page.projects ? projectsWord(page.projects.length) : undefined}
        cards={cards}
        finished={page.finished}
        tasks={page.tasks}
        deleteNote={deleteAreaNote(contents?.[0]?.projects ?? 0, contents?.[0]?.tasks ?? 0)}
        onRename={(next) => void areas.rename(area.id, next)}
        onOpenProject={(projectId) => router.push(`/project/${projectId}`)}
        onAddProject={(project) => {
          if (spaceId) void projects.create(project, { spaceId, areaId: area.id });
        }}
        onAdd={() => quickAdd.open({ areaId: area.id })}
        onComplete={(task) => void tasks.complete(task.id)}
        onOpen={(task) => router.push(`/task/${task.id}`)}
        // The tap path for the web's drag: one key written, one place up or down among the area's own tasks.
        onMoveTask={(task, dir) => {
          const key = keyForStep(page.tasks, task.id, dir);
          if (key) void tasks.setOrder(task.id, key);
        }}
        // Only the area goes: its projects and tasks stay, without one, and the toast puts it back. Then back to Browse.
        onDelete={() => {
          void areas.remove(area.id);
          leave();
        }}
      />
    </Rows>
  );
}
