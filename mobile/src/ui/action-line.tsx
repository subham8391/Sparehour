// A row for something that is not a task to tick (a dropped task, one finished day of a repeat, a finished task
// kept on the server): TaskLine's measures, with a quiet mark where the ring would be, the title (two lines at
// most), a quiet line under it, and at the far edge the one thing the row offers, by name ("Restore"). A tap on
// the title opens it.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./icon";
import { TARGET, font, useColours } from "./theme";

export interface ActionLineProps {
  title: string;
  /** Where and when, under the title: "Acme · took 1h · 14:05". */
  detail?: string;
  /** `done`: the filled ring with its tick and a struck title, as a finished TaskLine. `none`: an empty quiet ring. */
  mark?: "done" | "none";
  onPress?: () => void;
  /** The row's one action; `accessibilityLabel` names it with its task ("Restore Call the bank"). */
  action?: { label: string; accessibilityLabel: string; onPress: () => void };
}

export function ActionLine({ title, detail, mark = "none", onPress, action }: ActionLineProps) {
  const c = useColours();
  const done = mark === "done";
  return (
    <View style={styles.row}>
      <View aria-hidden style={styles.markSlot}>
        <View style={[styles.ring, { borderColor: done ? c.ink3 : c.lineStrong, backgroundColor: done ? c.ink3 : "transparent" }]}>{done && <Icon name="check" size={14} color={c.surface} strokeWidth={2.4} />}</View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={!onPress} onPress={onPress} style={styles.body}>
        <Text numberOfLines={2} style={[styles.title, { color: c.ink3 }, done && styles.struck]}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={[styles.detail, { color: c.ink3 }]}>
            {detail}
          </Text>
        ) : null}
      </Pressable>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} onPress={action.onPress} style={styles.action}>
          <Text style={[styles.actionText, { color: c.ink }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingRight: 6 },
  markSlot: { width: 52, minHeight: 56, alignItems: "center", justifyContent: "center" },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, paddingVertical: 10, justifyContent: "center", minHeight: 56 },
  title: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  struck: { textDecorationLine: "line-through" },
  detail: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, marginTop: 1, fontVariant: ["tabular-nums"] },
  action: { minHeight: TARGET, minWidth: TARGET, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", marginLeft: 4 },
  actionText: { fontFamily: font.semibold, fontSize: 15 },
});
