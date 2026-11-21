"use client";
// Triage's pickers (SCREENS.md §5), lazy: the project picker — the organize island's MovePicker, one write and one
// undo — and the estimate and the deadline, the detail's own pickers in a sheet. The phone's "Project…" walks
// them in that order: a project, then the estimate and the deadline behind it, each skippable. An estimate alone
// keeps the task in the Inbox; a project or a deadline files it (TaskRepo's rule, PRODUCT_SPEC.md §5.1 rule 5).
import { useRef, useState } from "react";
import { localDate, type LocalDate } from "@/core/time";
import { useQuery } from "@/data/powersync";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { MovePicker, type MoveTarget } from "@/features/tasks/move-picker";
import { snoozePresets } from "@/features/tasks/snooze";
import { DatePicker, EstimatePicker } from "@/features/tasks/task-detail-panel";
import { useMoveProjects } from "@/features/tasks/use-move-projects";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icons";
import { Sheet } from "@/ui/sheet";
import { EYEBROW } from "@/ui/section-label";
import { TRIAGE_TASK_SQL, fileInProject, giveDeadline, giveEstimate, type TriageTaskRow } from "./triage-fields";

export type TriagePick = "project" | "estimate" | "deadline" | "project-then";

const dateOrNull = (iso: string | null | undefined): LocalDate | null => {
  if (!iso) return null;
  try {
    return localDate(iso);
  } catch {
    return null;
  }
};

/** One task's project picker, or its estimate or deadline; `project-then` goes on to the estimate and the deadline. */
export function TriageSheet({ id, pick, onDone, onClose }: { id: string; pick: TriagePick; onDone?: (filed: boolean) => void; onClose: () => void }) {
  const repo = useTaskRepo();
  const now = useNow();
  const { today, zone } = useLocalDay(now);
  const [step, setStep] = useState<"project" | "estimate" | "deadline" | "details">(pick === "project-then" ? "project" : pick);
  const picked = useRef(false);
  const { data: rows } = useQuery<TriageTaskRow>(TRIAGE_TASK_SQL, [id]);
  const task = rows?.[0];
  const { projects, areaOrder } = useMoveProjects(step === "project");

  const fileIn = (target: MoveTarget) => {
    if (target.kind !== "project") return;
    void fileInProject(repo, id, target).then((filed) => onDone?.(filed));
    if (pick === "project-then") setStep("details");
    else onClose();
  };
  const estimate = (m: number | null) => {
    void giveEstimate(repo, id, m).then((filed) => onDone?.(filed));
    if (step === "estimate") onClose();
  };
  const deadline = (d: LocalDate | null) => {
    void giveDeadline(repo, id, d).then((filed) => onDone?.(filed));
    if (step === "deadline") onClose();
  };

  if (step === "project") {
    // The picker closes itself just before it hands over a choice: only a close with no choice behind it (Escape, a
    // tap outside) ends the flow.
    const closed = () => queueMicrotask(() => !picked.current && onClose());
    const chosen = (target: MoveTarget) => {
      picked.current = true;
      fileIn(target);
    };
    return <MovePicker count={1} projects={projects} areaOrder={areaOrder} currentProjectId={task?.project_id ?? null} onPick={chosen} onClose={closed} />;
  }
  const label = step === "estimate" ? "Set estimate" : step === "deadline" ? "Set deadline" : "Estimate and deadline";
  const presets = snoozePresets(now, zone, today);
  const value = dateOrNull(task?.deadline);
  return (
    <Sheet label={label} onClose={onClose} width="sm" align="center">
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="-mt-1 flex items-center justify-between gap-2">
          <h2 className="min-w-0 text-body-lg font-medium text-ink">
            {label}
            {task?.title && <span className="block truncate text-body-sm font-normal text-ink-2">{task.title}</span>}
          </h2>
          <Button variant="icon" aria-label="Close" onClick={onClose} className="-mr-2">
            <Icon name="close" size={18} />
          </Button>
        </div>
        {(step === "estimate" || step === "details") && (
          <section aria-label="Estimate" className="flex flex-col gap-2">
            {step === "details" && <p className={EYEBROW}>Estimate</p>}
            <EstimatePicker value={task?.estimate_min ?? null} onChange={estimate} />
          </section>
        )}
        {(step === "deadline" || step === "details") && (
          <section aria-label="Deadline" className="flex flex-col gap-2">
            {step === "details" && <p className={EYEBROW}>Deadline</p>}
            <DatePicker value={value} today={today} now={now} zone={zone} presets={presets} autoFocus={step === "deadline"} onChange={deadline} />
          </section>
        )}
        {step === "details" && (
          <Button variant="primary" size="sheet" onClick={onClose}>
            Done
          </Button>
        )}
      </div>
    </Sheet>
  );
}
