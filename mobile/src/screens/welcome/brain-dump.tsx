// The brain dump (ONBOARDING.md step 3), wired to the phone's own database: what the line suggests from (projects with
// their area, every tag: the web's statements), what tasks like this usually take, what the line would do to today,
// and the save. How a line lands is the web's rule (`brainDumpDraft`: today unless it names its own day; the Inbox
// after the twentieth) and the write is quick add's own (features/quickadd/save-submission.ts). A pasted list's Undo
// takes its tasks back through the task repository. The drawing is brain-dump-view.tsx.
//
// The web also puts a paste on its undo history as a silent entry, for ⌘Z. A phone has no ⌘Z and a silent entry
// would sit on top of the history where the toast's Undo would take it back in place of the change the toast names
// (settings/use-settings.ts has the same rule), so none is recorded: the notice's own Undo is the way.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { suggestEstimate } from "@/core/estimates";
import type { TaskDraft } from "@/core/quickadd";
import { useLocalDatabase, useQuery, type LocalDatabase } from "@/data/powersync";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { withAreaNames } from "@/data/queries/project-label";
import { TAGS_SQL } from "@/data/queries/views";
import { ProjectRepo } from "@/data/repositories/project-repo";
import { useLearned } from "@/features/estimates/use-learned";
import type { QuickAddSubmission } from "@/features/quickadd/file-line";
import { saveSubmission } from "@/features/quickadd/save-submission";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { PLACEHOLDERS, PLACEHOLDER_MS, brainDumpDraft } from "@/features/welcome/welcome-rules";
import { apiFetch } from "~/api";
import { DayLine } from "~/screens/quick-add/day-line";
import type { QuickAddContext } from "~/screens/quick-add/use-composer";
import { BrainDumpView, type Added } from "./brain-dump-view";

/** The server, asked as the phone asks it (its session's token), for how the person's estimates run. */
const askServer: typeof fetch = (input, init) => apiFetch(String(input), init ?? {});
const makeProject = (db: LocalDatabase, name: string, spaceId: string) => new ProjectRepo(db).create(name, { spaceId });

export interface BrainDumpProps {
  ctx: QuickAddContext;
  spaceId: string | null;
  defaultEstimateMin: number;
  /** "Next — N things" or "I'll add things later": either way the first run is over. */
  onFinish: () => void;
  busy?: boolean;
  /** Why ending the first run failed; the step stays as it is. */
  failure?: string | null;
}

export function BrainDump({ ctx, spaceId, defaultEstimateMin, onFinish, busy = false, failure = null }: BrainDumpProps) {
  const db = useLocalDatabase() as LocalDatabase;
  const tasks = useTaskRepo();
  const [added, setAdded] = useState<Added[]>([]);
  /** How many lines have been handed to the save so far: the next one's place, counted before the list redraws. */
  const committed = useRef(0);
  const placeholder = useCyclingPlaceholder();

  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: tagRows } = useQuery<{ id: string; name: string | null }>(TAGS_SQL);
  const projects = useMemo(() => withAreaNames(projectRows ?? [], areaRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", area: p.area })), [projectRows, areaRows]);
  const tags = useMemo(() => (tagRows ?? []).filter((t) => t.name).map((t) => ({ id: t.id, name: t.name as string })), [tagRows]);

  const learned = useLearned(askServer);
  const usual = useCallback((task: { estimateMin: number | null; projectId: string | null }) => suggestEstimate(learned, task, defaultEstimateMin)?.minutes ?? null, [learned, defaultEstimateMin]);
  const { now, today } = ctx;
  const dayLine = useCallback((draft: TaskDraft) => <DayLine draft={draft} now={now} today={today} />, [now, today]);

  const onSubmit = useCallback(
    async (s: QuickAddSubmission): Promise<string> => {
      const index = committed.current++;
      try {
        const draft = brainDumpDraft(s.draft, today, index);
        const id = await saveSubmission({ db, tasks, spaceId, makeProject }, { ...s, draft });
        setAdded((list) => [...list, { id, draft }]);
        return id;
      } catch (e) {
        committed.current -= 1;
        throw e;
      }
    },
    [db, tasks, spaceId, today],
  );

  // A paste's one Undo: its tasks go, and its rows leave the list above the box. It runs once.
  const onPasted = useCallback(
    (ids: readonly string[]) => {
      let taken: Promise<void> | null = null;
      return () =>
        (taken ??= tasks.removeCreated(ids).then(() => {
          committed.current -= ids.length;
          setAdded((list) => list.filter((a) => !ids.includes(a.id)));
        }));
    },
    [tasks],
  );

  return <BrainDumpView ctx={ctx} projects={projects} tags={tags} added={added} placeholder={placeholder} onSubmit={onSubmit} onPasted={onPasted} onFinish={onFinish} busy={busy} failure={failure} dayLine={dayLine} usual={usual} />;
}

/** The three examples, 2.5 s apart; the first one, still, for people who asked the phone for less motion. */
function useCyclingPlaceholder(): string {
  const [i, setI] = useState(0);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (reduced) => {
        if (live && !reduced) id = setInterval(() => setI((n) => (n + 1) % PLACEHOLDERS.length), PLACEHOLDER_MS);
      },
      () => undefined,
    );
    return () => {
      live = false;
      if (id) clearInterval(id);
    };
  }, []);
  return PLACEHOLDERS[i];
}
