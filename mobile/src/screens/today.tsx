// Today on the phone (ANDROID_APP_SPEC.md §10, step 2), wired to the phone's own database. Everything it knows comes
// from the web app's own code, used as it is: the data hook (useToday), the capacity engine behind the figure, the
// quick-add parser behind the + button, and the repository that writes. The drawing is today-view.tsx.
import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parse } from "@/core/quickadd/parse";
import { formatDay } from "@/core/time/format-day";
import type { Task } from "@/core/types";
import { useQuery, useSyncStatus } from "@/data/powersync";
import { dayPart } from "@/features/looks/look";
import { useNow } from "@/features/shell/use-local-day";
import { minuteOnDay, partOfDay } from "@/features/today/day-minute";
import { useToday } from "@/features/today/hooks/use-today";
import { signOut } from "~/sync/database";
import { Icon } from "~/ui/icon";
import { TARGET, font, useColours, useScheme } from "~/ui/theme";
import { AddSheet } from "./add-sheet";
import { todayRows } from "./today-rows";
import { todaySummary } from "./today-summary";
import { TodayView } from "./today-view";

const SPACE_SQL = `select personal_space_id from users limit 1`;
/** How long "Completed · Undo" stays, as the web's toast does. */
const UNDO_MS = 6000;

export function Today() {
  const c = useColours();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const model = useToday(now);
  const status = useSyncStatus();
  const { data: spaces } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const spaceId = spaces?.[0]?.personal_space_id ?? null;
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [done, setDone] = useState<Task | null>(null);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [done]);

  const zone = model.settings?.timezone ?? "UTC";
  const clock = now.toZonedDateTimeISO(zone);
  const eveningAt = model.settings ? model.settings.eveningStartsAt.hour * 60 + model.settings.eveningStartsAt.minute : 18 * 60;
  // Past midnight on a day that has not rolled over yet, the day's own hours are all behind it (minuteOnDay).
  const minute = minuteOnDay(now, zone, model.today).minute;

  const add = (line: string): boolean => {
    const parsed = parse(line, { now, zone, today: model.today, eveningStartsAt: model.settings?.eveningStartsAt });
    if (!parsed.ok || !spaceId) return false;
    // A line with no day of its own is for the day on screen, as the web's Add a task on Today files it.
    void model.repo.create({ ...parsed.draft, doDate: parsed.draft.doDate ?? model.today }, { spaceId });
    return true;
  };
  const complete = (task: Task) => {
    void model.repo.complete(task.id);
    // A repeating task rolls on to its next day when completed; reopening would not take that back, so no Undo is offered.
    setDone(task.recurrenceRule ? null : task);
  };

  if (!model.ready) {
    return (
      <View style={[styles.waiting, { backgroundColor: c.paper, paddingTop: insets.top + 24 }]}>
        <Text style={[styles.waitingText, { color: c.ink2 }]}>{status.connected ? "Getting your data…" : "Connecting…"}</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <TodayView
        scheme={scheme}
        part={dayPart(clock.hour)}
        eyebrow={`Today · ${partOfDay(minute, eveningAt)}`}
        title={formatDay(model.day, { weekday: "long", month: "long", today: model.today })}
        summary={todaySummary(model.capacity)}
        rows={todayRows(model.carried, model.todayTasks, model.eveningTasks)}
        defaultEstimateMin={model.settings?.defaultEstimateMin ?? 30}
        onComplete={complete}
        onMenu={() => setMenu(true)}
        bottomRoom={88}
      />
      {done && (
        <View accessibilityRole="alert" style={[styles.toast, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text numberOfLines={1} style={[styles.toastText, { color: c.ink }]}>
            Completed “{done.title}”
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void model.repo.reopen(done.id);
              setDone(null);
            }}
            style={styles.toastAction}
          >
            <Text style={[styles.toastActionText, { color: c.ink }]}>Undo</Text>
          </Pressable>
        </View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Add a task" onPress={() => setAdding(true)} style={[styles.fab, { backgroundColor: c.ink }]}>
        <Icon name="plus" size={26} color={c.paper} strokeWidth={2} />
      </Pressable>
      <AddSheet open={adding} onAdd={add} onClose={() => setAdding(false)} />
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)} statusBarTranslucent navigationBarTranslucent>
        <Pressable accessibilityLabel="Close" onPress={() => setMenu(false)} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} />
        <View style={[styles.menu, { backgroundColor: c.surface, borderColor: c.line, top: insets.top + 52 }]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMenu(false);
              void signOut();
            }}
            style={styles.menuItem}
          >
            <Text style={[styles.menuText, { color: c.ink }]}>Sign out</Text>
            <Text style={[styles.menuNote, { color: c.ink3 }]}>Removes your data from this phone. It stays safe in your account.</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  waiting: { flex: 1, paddingHorizontal: 24 },
  waitingText: { fontFamily: font.medium, fontSize: 17 },
  fab: { position: "absolute", right: 20, bottom: 20, width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "#0e2240", shadowOpacity: 0.22, shadowRadius: 12, shadowOffset: { width: 0, height: 8 } },
  toast: { position: "absolute", left: 16, right: 92, bottom: 22, minHeight: 54, borderWidth: 1, borderRadius: 16, paddingLeft: 16, flexDirection: "row", alignItems: "center", elevation: 4 },
  toastText: { flex: 1, fontFamily: font.medium, fontSize: 15 },
  toastAction: { minHeight: TARGET, paddingHorizontal: 14, justifyContent: "center" },
  toastActionText: { fontFamily: font.semibold, fontSize: 15 },
  menu: { position: "absolute", right: 12, width: 280, borderWidth: 1, borderRadius: 16, paddingVertical: 6, elevation: 8 },
  menuItem: { minHeight: TARGET, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  menuText: { fontFamily: font.semibold, fontSize: 17 },
  menuNote: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
});
