// Today on the phone, first trial (ANDROID_APP_SPEC.md §10, step 1): the day, the spare-time number and the day's
// tasks, from the phone's own database. Everything it shows comes from the web app's own code, used as it is: the
// data hook (useToday), the queries, the mappers, the capacity engine and the quick-add parser. The screen is the
// only part written for the phone. It is not the finished Today: no timeline, no ribbon, no swipes yet (§9).
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { parse } from "@/core/quickadd/parse";
import { formatMinutes } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { useQuery, useSyncStatus } from "@/data/powersync";
import { useNow } from "@/features/shell/use-local-day";
import { useToday } from "@/features/today/hooks/use-today";
import { signOut } from "~/sync/database";
import { todayRows, type Row } from "./today-rows";
import { TARGET, useColours, type Colours } from "~/ui/theme";

const SPACE_SQL = `select personal_space_id from users limit 1`;

export function Today() {
  const c = useColours();
  const now = useNow();
  const model = useToday(now);
  const status = useSyncStatus();
  const { data: spaces } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const spaceId = spaces?.[0]?.personal_space_id ?? null;
  const [line, setLine] = useState("");
  const zone = model.settings?.timezone ?? "UTC";

  const add = async () => {
    const parsed = parse(line, { now, zone, today: model.today, eveningStartsAt: model.settings?.eveningStartsAt });
    if (!parsed.ok || !spaceId) return;
    setLine("");
    // A line with no day of its own is for the day on screen, as the web's Add a task on Today files it.
    await model.repo.create({ ...parsed.draft, doDate: parsed.draft.doDate ?? model.today }, { spaceId });
  };

  if (!model.ready) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: c.paper }]}>
        <Text style={[styles.waiting, { color: c.ink2 }]}>{status.connected ? "Getting your data…" : "Connecting…"}</Text>
      </SafeAreaView>
    );
  }

  const cap = model.capacity;
  const over = cap ? cap.overMin > 0 : false;
  const rows = todayRows(model.carried, model.todayTasks, model.eveningTasks);
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.paper }]} edges={["top", "left", "right"]}>
      <View style={styles.head}>
        <Text style={[styles.eyebrow, { color: c.ink3 }]}>TODAY</Text>
        <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
          {formatDay(model.day, { weekday: "long", month: "long", today: model.today })}
        </Text>
        {cap === null || cap.state === "no_work_day" ? (
          <Text style={[styles.note, { color: c.ink2 }]}>No working hours today</Text>
        ) : (
          <Text accessibilityLabel={`${formatMinutes(over ? cap.overMin : cap.spareMin)} ${over ? "over" : "spare"}`} style={[styles.figure, { color: c.ink }]}>
            {formatMinutes(over ? cap.overMin : cap.spareMin)} <Text style={[styles.unit, { color: over ? c.over : c.spare }]}>{over ? "over" : "spare"}</Text>
          </Text>
        )}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.note, { color: c.ink2 }]}>Nothing planned for today.</Text>}
        renderItem={({ item }) => (item.kind === "header" ? <Header row={item} c={c} /> : <TaskRow task={item.task} c={c} defaultEstimateMin={model.settings?.defaultEstimateMin ?? 30} />)}
      />
      <View style={[styles.addBar, { borderTopColor: c.line, backgroundColor: c.surface }]}>
        <TextInput
          accessibilityLabel="Add a task"
          placeholder="Add a task"
          placeholderTextColor={c.ink4}
          value={line}
          onChangeText={setLine}
          returnKeyType="done"
          onSubmitEditing={() => void add()}
          style={[styles.addField, { color: c.ink }]}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void signOut()} style={styles.signOut}>
          <Text style={{ color: c.ink3 }}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Header({ row, c }: { row: Extract<Row, { kind: "header" }>; c: Colours }) {
  return (
    <Text accessibilityRole="header" style={[styles.section, { color: c.ink3 }]}>
      {row.label.toUpperCase()} {row.count}
    </Text>
  );
}

function TaskRow({ task, c, defaultEstimateMin }: { task: Task; c: Colours; defaultEstimateMin: number }) {
  // A task without an estimate counts as the account's default, shown with a question mark as on the web.
  const estimate = task.estimateMin ? formatMinutes(task.estimateMin) : `${formatMinutes(defaultEstimateMin)}?`;
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Text numberOfLines={2} style={[styles.rowTitle, { color: c.ink }]}>
        {task.title}
      </Text>
      {task.carryCount > 0 && <Text style={[styles.rowMeta, { color: c.ink3 }]}>×{task.carryCount}</Text>}
      <Text style={[styles.rowMeta, { color: c.ink2 }]}>{estimate}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  waiting: { padding: 24, fontSize: 17 },
  head: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 4 },
  eyebrow: { fontSize: 12, fontWeight: "600", letterSpacing: 1.2 },
  title: { fontSize: 28, fontWeight: "700" },
  figure: { fontSize: 34, fontWeight: "700", marginTop: 8, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 20, fontWeight: "600" },
  note: { fontSize: 17, marginTop: 8, paddingHorizontal: 0 },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 6 },
  section: { fontSize: 12, fontWeight: "600", letterSpacing: 1.2, marginTop: 14, marginBottom: 2, marginLeft: 4 },
  row: { minHeight: 56, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  rowTitle: { flex: 1, fontSize: 17, lineHeight: 22 },
  rowMeta: { fontSize: 14, fontVariant: ["tabular-nums"] },
  addBar: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  addField: { flex: 1, minHeight: TARGET, fontSize: 17 },
  signOut: { minHeight: TARGET, justifyContent: "center", paddingHorizontal: 4 },
});
