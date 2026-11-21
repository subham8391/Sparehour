// Someday as the phone draws it (SCREENS.md §7): the guilt-free parking lot. What the rollover filed on its own is
// pinned at the top with Review and Bring them all back, the rest is grouped by project, loose tasks last. A row's
// ring completes it, its title opens it, and its ⋯ holds Today · Pick a date · Back to active · Drop. No counts
// elsewhere, no age shaming. Presentational: it is handed everything it shows.
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Empty } from "~/ui/empty";
import { Icon } from "~/ui/icon";
import { RowMore } from "~/ui/nav-row";
import { Screen } from "~/ui/screen";
import { SectionLabel } from "~/ui/section-label";
import { TaskLine } from "~/ui/task-line";
import { TARGET, font, useColours } from "~/ui/theme";

export interface SomedayProject {
  projectId: string;
  name: string;
  /** The project's area, named beside it; null for a project without one. */
  area: string | null;
  tasks: readonly Task[];
}

export interface SomedayViewProps {
  today: LocalDate;
  defaultEstimateMin: number;
  /** Nothing is parked (and the device has been read). */
  empty: boolean;
  /** Filed by the rollover and not touched since. */
  autoFiled: readonly Task[];
  projects: readonly SomedayProject[];
  /** In no project, or in one this device does not know. */
  loose: readonly Task[];
  projectNames: ReadonlyMap<string, string>;
  /** The setting behind "You hadn't touched these in 30 days." */
  autoSomedayDays: number;
  /** How many tasks a new batch moved here; 0 when it has been said already. */
  announced: number;
  onReview: () => void;
  onDismiss: () => void;
  onBringAllBack: () => void;
  onComplete: (task: Task) => void;
  onOpen: (task: Task) => void;
  onMore: (task: Task) => void;
}

const tasksWord = (n: number) => (n === 1 ? "1 task" : `${n} tasks`);

export function SomedayView(p: SomedayViewProps) {
  const c = useColours();
  const rows = (tasks: readonly Task[], inProject: boolean) => (
    <Card>
      {tasks.map((task, i) => {
        const project = !inProject && task.projectId ? p.projectNames.get(task.projectId) : undefined;
        const detail = [project, ...(task.tags ?? []).map((t) => `@${t}`)].filter(Boolean).join(" · ");
        return (
          <CardRow key={task.id} first={i === 0} style={styles.row}>
            <View style={styles.line}>
              <TaskLine task={task} today={p.today} defaultEstimateMin={p.defaultEstimateMin} detail={detail || undefined} onComplete={p.onComplete} onPress={p.onOpen} />
            </View>
            <View style={styles.more}>
              <RowMore label={`More actions for ${task.title}`} onPress={() => p.onMore(task)} />
            </View>
          </CardRow>
        );
      })}
    </Card>
  );
  return (
    <Screen title="Things you’re not doing right now." eyebrow="Someday" back>
      <Text style={[styles.subtitle, { color: c.ink2 }]}>That’s allowed.</Text>
      {p.announced > 0 ? (
        <Card style={styles.announce}>
          <Text accessibilityRole="alert" style={[styles.announceText, { color: c.ink2 }]}>
            {tasksWord(p.announced)} moved to Someday while you weren’t looking
          </Text>
          <Button variant="quiet" label="Review" accessibilityLabel="Review what moved to Someday" onPress={p.onReview} />
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={p.onDismiss} style={styles.dismiss}>
            <Icon name="close" size={16} color={c.ink2} />
          </Pressable>
        </Card>
      ) : null}
      {p.empty ? (
        <>
          <View style={styles.moon}>
            <Icon name="moon" size={22} color={c.ink3} />
          </View>
          <Empty title="Nothing parked. That’s fine too." />
        </>
      ) : (
        <>
          {p.autoFiled.length > 0 ? (
            <View>
              <SectionLabel label="Moved here automatically" count={p.autoFiled.length} />
              <Text style={[styles.note, { color: c.ink2 }]}>You hadn’t touched these in {p.autoSomedayDays} days.</Text>
              <View style={styles.actions}>
                <Button variant="quiet" label="Review" onPress={p.onReview} />
                <Button variant="quiet" label="Bring them all back" onPress={p.onBringAllBack} />
              </View>
              {rows(p.autoFiled, false)}
            </View>
          ) : null}
          {p.projects.map((g) => (
            <View key={g.projectId}>
              <SectionLabel label={g.name} count={g.tasks.length} detail={g.area ?? undefined} />
              {rows(g.tasks, true)}
            </View>
          ))}
          {p.loose.length > 0 ? (
            <View>
              <SectionLabel label="Not in a project" count={p.loose.length} />
              {rows(p.loose, false)}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: font.medium, fontSize: 17, marginHorizontal: 20, marginTop: -10, marginBottom: 6 },
  announce: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, paddingVertical: 4, marginTop: 8 },
  announceText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, paddingVertical: 6 },
  dismiss: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  moon: { marginHorizontal: 22, marginTop: 12, marginBottom: 10 },
  note: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginHorizontal: 22 },
  actions: { flexDirection: "row", alignItems: "center", gap: 4, marginHorizontal: 10, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center" },
  line: { flex: 1 },
  more: { marginLeft: -12 },
});
