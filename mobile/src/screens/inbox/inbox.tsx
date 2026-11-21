// The Inbox on the phone (ANDROID_APP_SPEC.md §10; SCREENS.md §5), wired to the phone's own database. Everything it
// knows comes from the web app's own code, used as it is: the queue's statement (INBOX_SQL), each row's age, the
// write behind every triage choice (features/inbox/triage.ts, triage-fields.ts), the snooze presets and Move to…
// (features/tasks/snooze.ts, move-to-day.ts), the quick-add parser behind the + button, and the repository that
// writes and records the undo the app's one toast offers. The drawing is inbox-view.tsx; Triage all is triage-walk.tsx.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { parse } from "@/core/quickadd/parse";
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
import { AddSheet } from "../add-sheet";
import { inboxRows } from "./inbox-rows";
import { InboxView } from "./inbox-view";
import { TriageWalk } from "./triage-walk";

const SPACE_SQL = `select personal_space_id from users limit 1`;

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
  const { data: spaces } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const spaceId = spaces?.[0]?.personal_space_id ?? null;
  const [adding, setAdding] = useState(false);
  const [walking, setWalking] = useState<readonly string[] | null>(null);

  const rows = inboxRows(data ?? [], projectNames, today, zone);

  // A line with no day and no project stays here; a day or a project files it (the repository's rule, PRODUCT_SPEC.md
  // §5.1 rule 5). Days are counted from the person's today, as quick add counts them.
  const add = (line: string): boolean => {
    const parsed = parse(line, { now, zone, today, eveningStartsAt: settings?.eveningStartsAt });
    if (!parsed.ok || !spaceId) return false;
    void repo.create(parsed.draft, { spaceId });
    return true;
  };

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
      <Pressable accessibilityRole="button" accessibilityLabel="Add to Inbox" onPress={() => setAdding(true)} style={[styles.fab, { backgroundColor: c.ink }]}>
        <Icon name="plus" size={26} color={c.paper} strokeWidth={2} />
      </Pressable>
      <AddSheet open={adding} onAdd={add} onClose={() => setAdding(false)} hint="A line with no day stays in the Inbox. A day or a project files it." />
      <TriageWalk ids={walking} onClose={() => setWalking(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fab: { position: "absolute", right: 20, bottom: 20, width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#0e2240", shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
});
