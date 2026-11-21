// Triage all on the phone (SCREENS.md §5), wired to the phone's own database: the walk is the web app's own
// (features/inbox/use-triage-walk.ts: the queue, each decision's write and its undo, where the walk stands), and the
// pickers' writes are its own too (features/inbox/triage-fields.ts). Full-screen over the tabs; Android's back leaves
// it. The drawing is triage-walk-view.tsx. The app's toast is under this screen while it is open, so the walk's own
// "Last: … Undo" line is the way back here: it calls the app's one undo, as the web's walk does.
import { Modal } from "react-native";
import { localDate, type LocalDate } from "@/core/time";
import { useQuery } from "@/data/powersync";
import { addedLabel } from "@/features/inbox/age";
import type { TriageChoice, TriageField } from "@/features/inbox/triage";
import { TRIAGE_TASK_SQL, fileInProject, giveDeadline, giveEstimate, type TriageTaskRow } from "@/features/inbox/triage-fields";
import { ALL_ACTIONS, CHOICES, inTheInbox, useTriageWalk } from "@/features/inbox/use-triage-walk";
import { useNow } from "@/features/shell/use-local-day";
import { useMoveProjects } from "@/features/tasks/use-move-projects";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { notePlain } from "@/ui/markdown-plain";
import { TriageSheet } from "./triage-sheet";
import { TriageWalkView } from "./triage-walk-view";

const dateOrNull = (iso: string | null | undefined): LocalDate | null => {
  if (!iso) return null;
  try {
    return localDate(iso.slice(0, 10));
  } catch {
    return null;
  }
};

const WALK_CHOICES = ALL_ACTIONS.filter((a): a is TriageChoice => CHOICES.has(a));
const WALK_FIELDS = ALL_ACTIONS.filter((a): a is TriageField => !CHOICES.has(a));

/** The walk over `ids`, in order; closed while `ids` is null. */
export function TriageWalk({ ids, onClose }: { ids: readonly string[] | null; onClose: () => void }) {
  return (
    <Modal visible={ids !== null} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {ids ? <Walk ids={ids} onClose={onClose} /> : null}
    </Modal>
  );
}

function Walk({ ids, onClose }: { ids: readonly string[]; onClose: () => void }) {
  const walk = useTriageWalk({ ids });
  const repo = useTaskRepo();
  const now = useNow();
  const id = walk.id;
  // What the task on screen has now, for the picker open over it.
  const { data: taskRows } = useQuery<TriageTaskRow>(TRIAGE_TASK_SQL, [id ?? ""]);
  const task = id ? taskRows?.[0] : undefined;
  const choices = useMoveProjects(walk.picking === "project");
  // A picker's write, then the walk is told: a project or a deadline files the task and the walk moves on.
  const give = (write: Promise<boolean>) => {
    if (!id) return;
    void write.then((filed) => walk.wrote(id, filed));
    walk.setPicking(null);
  };

  return (
    <TriageWalkView
      loaded={walk.loaded}
      task={id && walk.row ? { title: walk.row.title ?? "", age: addedLabel(walk.row.created_at, walk.today, walk.zone), note: notePlain(walk.row.notes_md) } : null}
      position={id ? ids.indexOf(id) + 1 : 0}
      total={ids.length}
      left={walk.left}
      choices={WALK_CHOICES}
      fields={WALK_FIELDS}
      last={walk.last && walk.canUndo ? walk.last.title : null}
      canBack={walk.canBack}
      remaining={inTheInbox}
      onAct={walk.act}
      onStep={walk.step}
      onUndo={() => void walk.undo()}
      onLeave={onClose}
    >
      <TriageSheet
        step={id ? walk.picking : null}
        title={walk.row?.title ?? ""}
        projectId={task?.project_id ?? null}
        estimateMin={task?.estimate_min ?? null}
        deadline={dateOrNull(task?.deadline)}
        doDate={null}
        choices={choices}
        today={walk.today}
        now={now}
        zone={walk.zone}
        onProject={(project) => id && give(fileInProject(repo, id, project))}
        onEstimate={(minutes) => id && give(giveEstimate(repo, id, minutes))}
        onDeadline={(deadline) => id && give(giveDeadline(repo, id, deadline))}
        onDay={() => undefined}
        onClose={() => walk.setPicking(null)}
      />
    </TriageWalkView>
  );
}
