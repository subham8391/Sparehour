// The Inbox as the phone draws it (SCREENS.md §5 at phone width; DECISIONS.md "Phone tap on an Inbox row"): a queue
// to empty. One card of rows, newest capture first, each with its age; a tap on a row opens the task, and the row's ⋯
// is the one every list has (screens/rows), headed by the four triage choices (Today · Tomorrow · Someday ·
// Project…), then Drop, This week, the estimate and the deadline, and what the menu adds for any open task. A right
// swipe is Today, a left one Someday. "Triage all" asks for the walk.
// Presentational: it is handed everything it shows and says what was chosen; inbox.tsx makes the writes.
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { Text } from "~/ui/text";
import type { Instant, LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { TRIAGE_LABEL, type TriageChoice } from "@/features/inbox/triage";
import type { DayPart } from "@/features/looks/look";
import { moveActions } from "~/screens/rows/row-menu";
import { useRows } from "~/screens/rows/rows-context";
import { TaskRow } from "~/screens/rows/task-row";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Empty } from "~/ui/empty";
import { Screen } from "~/ui/screen";
import { font, useColours } from "~/ui/theme";
import type { InboxRow } from "./inbox-rows";
import type { PickedProject, ProjectChoicesData } from "./triage-choices";
import { TriageSheet, type TriageStep } from "./triage-sheet";

export interface InboxViewProps {
  part: DayPart;
  /** The queue has not been read yet: the header alone, no empty state. */
  loading?: boolean;
  rows: readonly InboxRow[];
  today: LocalDate;
  now: Instant;
  zone: string;
  defaultEstimateMin: number;
  /** The projects "Project…" files into. */
  choices: ProjectChoicesData;
  onOpen?: (task: Task) => void;
  onComplete: (task: Task) => void;
  /** Today, Tomorrow, This week, Someday or Drop. */
  onTriage: (task: Task, choice: TriageChoice) => void;
  /** Converts the task to a project: the long-estimate hint's "Break it down". */
  onBreakDown?: (task: Task) => void;
  onProject: (task: Task, project: PickedProject) => void;
  onEstimate: (task: Task, minutes: number | null) => void;
  onDeadline: (task: Task, deadline: LocalDate | null) => void;
  onTriageAll: () => void;
  /** Room left at the bottom for whatever floats over the list (the add button). */
  bottomRoom?: number;
}

/** The picker open over the list: the task as it was when its sheet opened, and what has been picked since. */
interface Picking {
  task: Task;
  step: TriageStep;
  projectId: string | null;
  estimateMin: number | null;
  deadline: LocalDate | null;
}

export function InboxView(p: InboxViewProps) {
  const c = useColours();
  const [picking, setPicking] = useState<Picking | null>(null);
  const count = p.rows.length;
  // The phone's way into a bulk edit besides a long-press (DESIGN_SYSTEM.md §4a Inbox): Select shows every row's
  // checkbox, Done lets go of them. Only inside the screen's frame, which keeps the ticks.
  const rows = useRows();
  const bulk = rows !== null && (rows.checkedIds.length > 0 || rows.selecting);
  const setSelecting = rows?.setSelecting;
  useEffect(() => () => setSelecting?.(false), [setSelecting]);
  /** A picker for the row: the task as it is now, and what has been picked since. */
  const pick = (task: Task, step: TriageStep) => () => setPicking({ task, step, projectId: task.projectId, estimateMin: task.estimateMin, deadline: task.deadline });
  const triage = (task: Task, choice: TriageChoice) => () => p.onTriage(task, choice);

  return (
    <Screen title={count > 0 ? `${count} to triage` : "Inbox"} eyebrow="Inbox" part={p.part} bottomRoom={p.bottomRoom} actions={
        count > 0 ? (
          <>
            {rows ? (
              <Button
                variant="quiet"
                label={bulk ? "Done" : "Select"}
                onPress={() => {
                  if (bulk) rows.clearChecks();
                  rows.setSelecting(!bulk);
                }}
              />
            ) : null}
            <Button variant="quiet" label="Triage all" onPress={p.onTriageAll} />
          </>
        ) : undefined
      }
    >
      <Text style={[styles.sub, { color: c.ink2 }]}>A queue to empty, not a list to keep.</Text>
      {p.loading ? null : count === 0 ? (
        <Empty title="Inbox zero. Nice." line="Tap + to add to the Inbox." />
      ) : (
        <Card>
          {p.rows.map(({ task, detail }, i) => (
            <CardRow key={task.id} first={i === 0}>
              <TaskRow
                task={task}
                today={p.today}
                meta={detail || undefined}
                defaultEstimateMin={p.defaultEstimateMin}
                onComplete={p.onComplete}
                onOpen={p.onOpen}
                onBreakDown={p.onBreakDown}
                // The four that head the row's sheet (SCREENS.md §5 "Responsive"); Project… is the picker, then the estimate and the deadline behind it.
                lead={[
                  { label: TRIAGE_LABEL.today, run: triage(task, "today") },
                  { label: TRIAGE_LABEL.tomorrow, run: triage(task, "tomorrow") },
                  { label: TRIAGE_LABEL.someday, run: triage(task, "someday") },
                  { label: "Project…", run: pick(task, "project") },
                ]}
                actions={[
                  ...moveActions({ onToday: triage(task, "today"), onTomorrow: triage(task, "tomorrow"), onSomeday: triage(task, "someday"), onDrop: triage(task, "drop") }),
                  { label: TRIAGE_LABEL.week, run: triage(task, "week") },
                  { label: "Estimate…", run: pick(task, "estimate") },
                  { label: "Deadline…", run: pick(task, "deadline") },
                ]}
              />
            </CardRow>
          ))}
        </Card>
      )}

      <TriageSheet
        step={picking?.step ?? null}
        title={picking?.task.title ?? ""}
        projectId={picking?.projectId ?? null}
        estimateMin={picking?.estimateMin ?? null}
        deadline={picking?.deadline ?? null}
        doDate={null}
        choices={p.choices}
        today={p.today}
        now={p.now}
        zone={p.zone}
        onProject={(project) => {
          if (!picking) return;
          p.onProject(picking.task, project);
          // Behind the project: the estimate and the deadline, each skippable (SCREENS.md §5).
          setPicking({ ...picking, step: "details", projectId: project.id });
        }}
        onEstimate={(minutes) => {
          if (!picking) return;
          p.onEstimate(picking.task, minutes);
          setPicking(picking.step === "details" ? { ...picking, estimateMin: minutes } : null);
        }}
        onDeadline={(deadline) => {
          if (!picking) return;
          p.onDeadline(picking.task, deadline);
          setPicking(picking.step === "details" ? { ...picking, deadline } : null);
        }}
        onDay={() => setPicking(null)}
        onClose={() => setPicking(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, marginHorizontal: 20, marginTop: -8, marginBottom: 14 },
});
