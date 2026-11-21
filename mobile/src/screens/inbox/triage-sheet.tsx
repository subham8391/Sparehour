// One task's triage picker as a bottom sheet (SCREENS.md §5; the web's is features/inbox/triage-sheet.tsx): the
// project picker, the estimate, the deadline, the two together behind "Project…" ("Estimate and deadline", each
// skippable, then Done), or a day to move it to. Presentational: it says what was picked, and whoever opened it
// writes and decides whether it stays open.
import { StyleSheet, Text } from "react-native";
import type { Instant, LocalDate } from "@/core/time";
import { Button } from "~/ui/button";
import { MenuHeading } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";
import { font, useColours } from "~/ui/theme";
import { DayChoices, EstimateChoices, ProjectChoices, type PickedProject, type ProjectChoicesData } from "./triage-choices";

/** `details` is the estimate and the deadline together; `day` is Move to…. */
export type TriageStep = "project" | "estimate" | "deadline" | "details" | "day";

const LABEL: Record<TriageStep, string> = {
  project: "Move this task to a project",
  estimate: "Set estimate",
  deadline: "Set deadline",
  details: "Estimate and deadline",
  day: "Move to…",
};

export interface TriageSheetProps {
  /** Which picker is open; null when none is. */
  step: TriageStep | null;
  /** The task it is for, said under the sheet's name. */
  title: string;
  /** What the task has now, marked in the picker. */
  projectId: string | null;
  estimateMin: number | null;
  deadline: LocalDate | null;
  doDate: LocalDate | null;
  choices: ProjectChoicesData;
  today: LocalDate;
  now: Instant;
  zone: string;
  onProject: (project: PickedProject) => void;
  onEstimate: (minutes: number | null) => void;
  onDeadline: (deadline: LocalDate | null) => void;
  onDay: (day: LocalDate) => void;
  onClose: () => void;
}

export function TriageSheet(p: TriageSheetProps) {
  const c = useColours();
  const step = p.step;
  return (
    <Sheet open={step !== null} title={step ? LABEL[step] : undefined} onClose={p.onClose} footer={step === "details" ? <Button variant="primary" label="Done" onPress={p.onClose} /> : <Button variant="quiet" label="Cancel" onPress={p.onClose} />}>
      {p.title ? (
        <Text numberOfLines={2} style={[styles.task, { color: c.ink2 }]}>
          {p.title}
        </Text>
      ) : null}
      {step === "project" && <ProjectChoices {...p.choices} currentProjectId={p.projectId} onPick={p.onProject} />}
      {step === "details" && <MenuHeading label="Estimate" />}
      {(step === "estimate" || step === "details") && <EstimateChoices value={p.estimateMin} onPick={p.onEstimate} />}
      {step === "details" && <MenuHeading label="Deadline" />}
      {(step === "deadline" || step === "details") && <DayChoices value={p.deadline} today={p.today} now={p.now} zone={p.zone} clear="Clear" onPick={p.onDeadline} />}
      {step === "day" && <DayChoices value={p.doDate} today={p.today} now={p.now} zone={p.zone} onPick={(day) => day && p.onDay(day)} />}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  task: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, marginTop: -6 },
});
