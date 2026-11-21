// The Inbox on the phone (ANDROID_APP_SPEC.md §10; SCREENS.md §5), wired to the phone's own database. Everything it
// knows comes from the web app's own code, used as it is: the queue's statement (INBOX_SQL), each row's age, the
// write behind every triage choice (features/inbox/triage.ts, triage-fields.ts), the snooze presets and Move to…
// (features/tasks/snooze.ts, move-to-day.ts), quick add behind the + button (quick-add/quick-add.tsx), and the
// repository that writes and records the undo the app's one toast offers. The drawing is inbox-view.tsx; Triage all is triage-walk.tsx.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { INBOX_SQL } from "@/data/queries/views";
import type { TaskRow } from "@/data/schema.client";
import { triage } from "@/features/inbox/triage";
import { fileInProject, giveDeadline, giveEstimate } from "@/features/inbox/triage-fields";
import { dayPart } from "@/features/looks/look";
import { useProjectNames } from "@/features/projects/use-project-names";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { moveToDay } from "@/features/tasks/move-to-day";
import { applySnooze } from "@/features/tasks/snooze";
import { useMoveProjects } from "@/features/tasks/use-move-projects";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { Icon } from "~/ui/icon";
import { useColours } from "~/ui/theme";
import { useQuickAdd } from "../quick-add/quick-add";
import { inboxRows } from "./inbox-rows";
import { InboxView } from "./inbox-view";
import { TriageWalk } from "./triage-walk";

export function Inbox() {
  const c = useColours();
  const router = useRouter();
  const db = useLocalDatabase();
  const repo = useTaskRepo();
  const now = useNow();
  const { today, zone, settings, ready } = useLocalDay(now);
  const { data, isLoading } = useQuery<TaskRow>(INBOX_SQL);
  const projectNames = useProjectNames();
  const choices = useMoveProjects();
  const quickAdd = useQuickAdd();
  const [walking, setWalking] = useState<readonly string[] | null>(null);

  const rows = inboxRows(data ?? [], projectNames, today, zone);

  return (
    <View style={styles.fill}>
      <InboxView
        part={dayPart(now.toZonedDateTimeISO(zone).hour)}
        // The presets and every "today" wait for the account's own day and zone.
        loading={isLoading || !ready}
        rows={rows}
        today={today}
        now={now}
        zone={zone}
        defaultEstimateMin={settings?.defaultEstimateMin ?? 30}
        choices={choices}
        onOpen={(task) => router.push(`/task/${task.id}`)}
        // Every write records its own undo; the toast with Undo is the app's one (ui/undo-provider.tsx).
        onComplete={(task) => void repo.complete(task.id)}
        onTriage={(task, choice) => void triage(repo, task.id, choice, today)}
        onSnooze={(task, preset) => void applySnooze(repo, [task.id], preset)}
        onMoveToDay={(task, day) => void moveToDay(db, repo, task.id, day)}
        onProject={(task, project) => void fileInProject(repo, task.id, project)}
        onEstimate={(task, minutes) => void giveEstimate(repo, task.id, minutes)}
        onDeadline={(task, deadline) => void giveDeadline(repo, task.id, deadline)}
        onTriageAll={() => setWalking(rows.map((r) => r.task.id))}
        bottomRoom={88}
      />
      {/* Plain capture: a line with no day and no project stays here; a day or a project files it (PRODUCT_SPEC.md §5.1 rule 5). */}
      <Pressable accessibilityRole="button" accessibilityLabel="Add to Inbox" onPress={() => quickAdd.open()} style={[styles.fab, { backgroundColor: c.ink }]}>
        <Icon name="plus" size={26} color={c.paper} strokeWidth={2} />
      </Pressable>
      <TriageWalk ids={walking} onClose={() => setWalking(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fab: { position: "absolute", right: 20, bottom: 20, width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#0e2240", shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
});
