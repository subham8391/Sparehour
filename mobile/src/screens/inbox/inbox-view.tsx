// The Inbox as the phone draws it (SCREENS.md §5 at phone width; DECISIONS.md "Phone tap on an Inbox row"): a queue
// to empty. One card of rows, newest capture first, each with its age; a tap on a row opens the task, and the row's ⋯
// opens its sheet, headed by the four triage choices (Today · Tomorrow · Someday · Project…), then Drop, This week
// and Complete, the estimate and the deadline, and the days a task can be moved to. "Triage all" asks for the walk.
// Presentational: it is handed everything it shows and says what was chosen; inbox.tsx makes the writes.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Instant, LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { TRIAGE_LABEL, type TriageChoice } from "@/features/inbox/triage";
import type { DayPart } from "@/features/looks/look";
import { snoozePresets, type SnoozePreset } from "@/features/tasks/snooze";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Empty } from "~/ui/empty";
import { Icon } from "~/ui/icon";
import { MenuDivider, MenuRow } from "~/ui/menu-row";
import { Screen } from "~/ui/screen";
import { Sheet } from "~/ui/sheet";
import { TaskLine } from "~/ui/task-line";
import { TARGET, font, useColours } from "~/ui/theme";
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
  /** This evening, In 4 hours, This weekend or Next week. */
  onSnooze: (task: Task, preset: SnoozePreset) => void;
  onMoveToDay: (task: Task, day: LocalDate) => void;
  onProject: (task: Task, project: PickedProject) => void;
  onEstimate: (task: Task, minutes: number | null) => void;
  onDeadline: (task: Task, deadline: LocalDate | null) => void;
  onTriageAll: () => void;
  /** Room left at the bottom for whatever floats over the list (the add button). */
  bottomRoom?: number;
}

/** The four that head the row's sheet (SCREENS.md §5 "Responsive"); "project" is Project…, the picker and what is behind it. */
const LEAD = ["today", "tomorrow", "someday", "project"] as const;

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
  const [menu, setMenu] = useState<Task | null>(null);
  const [picking, setPicking] = useState<Picking | null>(null);
  const count = p.rows.length;

  /** A choice from the row's sheet: the sheet closes, then the choice is made. */
  const choose = (run: (task: Task) => void) => () => {
    const task = menu;
    setMenu(null);
    if (task) run(task);
  };
  const pick = (step: TriageStep) => choose((task) => setPicking({ task, step, projectId: task.projectId, estimateMin: task.estimateMin, deadline: task.deadline }));
  // The snooze presets under the row's own choices; Tomorrow is said once, in the four that head the sheet (the web's
  // row-menu.tsx does the same). They are the account's day and zone: inbox.tsx holds `loading` until those are read.
  const presets = snoozePresets(p.now, p.zone, p.today).filter((preset) => preset.label !== TRIAGE_LABEL.tomorrow);

  return (
    <Screen title={count > 0 ? `${count} to triage` : "Inbox"} eyebrow="Inbox" part={p.part} bottomRoom={p.bottomRoom} actions={count > 0 ? <Button variant="quiet" label="Triage all" onPress={p.onTriageAll} /> : undefined}>
      <Text style={[styles.sub, { color: c.ink2 }]}>A queue to empty, not a list to keep.</Text>
      {p.loading ? null : count === 0 ? (
        <Empty title="Inbox zero. Nice." line="Tap + to add to the Inbox." />
      ) : (
        <Card>
          {p.rows.map(({ task, detail }, i) => (
            <CardRow key={task.id} first={i === 0} style={styles.row}>
              <View style={styles.line}>
                <TaskLine task={task} today={p.today} detail={detail || undefined} defaultEstimateMin={p.defaultEstimateMin} onComplete={p.onComplete} onPress={p.onOpen} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`More actions for ${task.title}`} onPress={() => setMenu(task)} style={styles.more}>
                <Icon name="more" size={22} color={c.ink2} strokeWidth={2.4} />
              </Pressable>
            </CardRow>
          ))}
        </Card>
      )}

      <Sheet open={menu !== null} onClose={() => setMenu(null)}>
        <Text accessibilityRole="header" numberOfLines={2} style={[styles.menuTitle, { color: c.ink }]}>
          {menu?.title ?? ""}
        </Text>
        <View style={styles.lead}>
          {LEAD.map((a) => (
            <Button
              key={a}
              label={a === "project" ? "Project…" : TRIAGE_LABEL[a]}
              // The first, no-penalty choice reads in ink, as on the web.
              style={[styles.leadButton, a === "today" && { borderColor: c.ink }]}
              // Project… is the picker, then the estimate and the deadline behind it.
              onPress={a === "project" ? pick("project") : choose((task) => p.onTriage(task, a))}
            />
          ))}
        </View>
        <View>
          <MenuRow label={TRIAGE_LABEL.drop} onPress={choose((task) => p.onTriage(task, "drop"))} />
          <MenuRow label={TRIAGE_LABEL.week} onPress={choose((task) => p.onTriage(task, "week"))} />
          <MenuRow label="Complete" onPress={choose(p.onComplete)} />
          <MenuDivider />
          <MenuRow label="Estimate…" onPress={pick("estimate")} />
          <MenuRow label="Deadline…" onPress={pick("deadline")} />
          <MenuDivider />
          {presets.map((preset) => (
            <MenuRow key={preset.id} label={preset.label} onPress={choose((task) => p.onSnooze(task, preset))} />
          ))}
          <MenuRow label="Move to…" onPress={pick("day")} />
        </View>
      </Sheet>

      <TriageSheet
        step={picking?.step ?? null}
        title={picking?.task.title ?? ""}
        projectId={picking?.projectId ?? null}
        estimateMin={picking?.estimateMin ?? null}
        deadline={picking?.deadline ?? null}
        doDate={picking?.task.doDate ?? null}
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
        onDay={(day) => {
          if (!picking) return;
          p.onMoveToDay(picking.task, day);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, marginHorizontal: 20, marginTop: -8, marginBottom: 14 },
  row: { flexDirection: "row", alignItems: "stretch" },
  line: { flex: 1 },
  more: { width: TARGET, minHeight: TARGET, marginLeft: -8, alignItems: "center", justifyContent: "center" },
  menuTitle: { fontFamily: font.semibold, fontSize: 18, lineHeight: 24 },
  lead: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  leadButton: { flexGrow: 1, flexBasis: "45%" },
});
