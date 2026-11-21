// Quick add, mounted once for the whole app (app/_layout.tsx) and opened from anywhere with `useQuickAdd().open()`:
// the + on Today, the Inbox and the Week tab, a day's "+ Add", search's "Add “foo” as a task". It never navigates.
// `open({ day })` is "Add a task adds where you are" (DECISIONS.md, amendment 2026-11-15): the day, the project or
// the area is carried beside the line, shown as a chip, and never typed into the box. Everything it knows is the
// web app's own code, used as it is: the lists it suggests from (the web's statements), what tasks like this usually
// take (core/estimates over the answer the device keeps), the save (features/quickadd/save-submission.ts: the
// space, the project found or made by ProjectRepo, the task and its tags by TaskRepo, which records the undo the
// app's one toast offers), and the undo of a discard. The drawing is quick-add-view.tsx.
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { suggestEstimate } from "@/core/estimates";
import type { TaskDraft } from "@/core/quickadd";
import type { LocalDate } from "@/core/time";
import { useLocalDatabase, useQuery, type LocalDatabase } from "@/data/powersync";
import { AREAS_SQL, PROJECTS_SQL, type AreaRow, type ProjectRow } from "@/data/queries/nav";
import { withAreaNames } from "@/data/queries/project-label";
import { TAGS_SQL } from "@/data/queries/views";
import { ProjectRepo } from "@/data/repositories/project-repo";
import { useLearned } from "@/features/estimates/use-learned";
import type { QuickAddSubmission } from "@/features/quickadd/file-line";
import { SPACE_SQL, saveSubmission } from "@/features/quickadd/save-submission";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { useUndoSink } from "@/features/undo/undo-context";
import { apiFetch } from "~/api";
import { DayLine } from "./day-line";
import { QuickAddView } from "./quick-add-view";
import type { SavedHere } from "./use-composer";

/**
 * Where a task added "here" is filed when its line does not say: the day a screen is showing, the project whose
 * page is open (and the heading under which its "+" was pressed), or the area whose page is open. `text` is what
 * the box opens holding (search's "Add “foo” as a task"); a screen's own "+" leaves it out, so the box opens empty.
 */
export interface AddHere {
  day?: LocalDate;
  projectId?: string;
  /** A heading of that project: the task goes under it while it is filed in that project. */
  headingId?: string;
  areaId?: string;
  text?: string;
}

interface QuickAddApi {
  open: (here?: AddHere) => void;
}

const QuickAddContext = createContext<QuickAddApi | null>(null);

export function useQuickAdd(): QuickAddApi {
  const api = useContext(QuickAddContext);
  if (!api) throw new Error("useQuickAdd needs a QuickAddProvider above it");
  return api;
}

/** The server, asked as the phone asks it (its session's token), for how the person's estimates run. */
const askServer: typeof fetch = (input, init) => apiFetch(String(input), init ?? {});

const makeProject = (db: LocalDatabase, name: string, spaceId: string) => new ProjectRepo(db).create(name, { spaceId });

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; key: number; here: AddHere }>({ open: false, key: 0, here: {} });
  const open = useCallback((here: AddHere = {}) => setState((s) => ({ open: true, key: s.key + 1, here })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  /** A fresh sheet holding exactly `text`, in the same place: what an Undo of a discard brings back. */
  const reopen = useCallback((text: string) => setState((s) => ({ open: true, key: s.key + 1, here: { ...s.here, text } })), []);
  const api = useMemo(() => ({ open }), [open]);
  return (
    <QuickAddContext.Provider value={api}>
      {children}
      {/* Nothing of the sheet is read or mounted until it is first asked for. */}
      {state.key > 0 && <QuickAddSheet key={state.key} open={state.open} here={state.here} onClose={close} onReopen={reopen} />}
    </QuickAddContext.Provider>
  );
}

function QuickAddSheet({ open, here, onClose, onReopen }: { open: boolean; here: AddHere; onClose: () => void; onReopen: (text: string) => void }) {
  const now = useNow();
  const { today, zone, settings } = useLocalDay(now);
  const db = useLocalDatabase();
  const tasks = useTaskRepo();
  const undo = useUndoSink();
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const spaceId = users?.[0]?.personal_space_id ?? null;

  // What the line suggests from: projects with their area, which tells two of one name apart, and every tag.
  const { data: projectRows } = useQuery<ProjectRow>(PROJECTS_SQL);
  const { data: areaRows } = useQuery<AreaRow>(AREAS_SQL);
  const { data: tagRows } = useQuery<{ id: string; name: string | null }>(TAGS_SQL);
  const projects = useMemo(() => withAreaNames(projectRows ?? [], areaRows ?? []).map((p) => ({ id: p.id, name: p.name ?? "Untitled project", area: p.area })), [projectRows, areaRows]);
  const tags = useMemo(() => (tagRows ?? []).filter((t) => t.name).map((t) => ({ id: t.id, name: t.name as string })), [tagRows]);
  const area = useMemo(() => {
    const row = here.areaId ? (areaRows ?? []).find((a) => a.id === here.areaId) : undefined;
    return row ? { id: row.id, name: row.name ?? "Untitled area" } : null;
  }, [here.areaId, areaRows]);

  // What finished tasks say about the line's estimate, from the answer the device keeps (DECISIONS.md, amendment 2026-11-15).
  const learned = useLearned(askServer);
  const defaultEstimate = settings?.defaultEstimateMin ?? 30;
  const usual = useCallback((task: { estimateMin: number | null; projectId: string | null }) => suggestEstimate(learned, task, defaultEstimate)?.minutes ?? null, [learned, defaultEstimate]);
  // What the line would do to its day's spare time, before it is saved (DECISIONS.md, amendment 2026-11-14).
  const dayLine = useCallback((draft: TaskDraft) => <DayLine draft={draft} now={now} today={today} />, [now, today]);

  const onSubmit = useCallback(
    (s: QuickAddSubmission, at: SavedHere) => saveSubmission({ db, tasks, spaceId, makeProject }, s, { headingId: at.pageProject ? (here.headingId ?? null) : null, areaId: at.areaId }),
    [db, tasks, spaceId, here.headingId],
  );

  // Closing with words in the box discards them with a one-step undo (PRODUCT_SPEC.md §5.1 rule 4): the toast
  // reopens the sheet holding them, and a redo discards them again.
  const onDiscard = useCallback(
    (text: string, title: string) => {
      const again = { redo: async () => onClose(), undo: async () => onReopen(text) };
      undo?.record({
        label: `Discarded “${title}”`,
        toast: true,
        undo: async () => {
          await again.undo();
          return again;
        },
      });
    },
    [undo, onReopen, onClose],
  );

  return (
    <QuickAddView
      open={open}
      initial={here.text}
      projects={projects}
      tags={tags}
      ctx={{ now, zone, today, eveningStartsAt: settings?.eveningStartsAt }}
      here={{ day: here.day ?? null, projectId: here.projectId ?? null, area }}
      onClose={onClose}
      onSubmit={onSubmit}
      onDiscard={onDiscard}
      dayLine={dayLine}
      usual={usual}
    />
  );
}
