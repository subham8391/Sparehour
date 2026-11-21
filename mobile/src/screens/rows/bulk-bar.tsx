// The bulk-edit bar on the phone (PRODUCT_SPEC.md "Multi-select + bulk edit"; SCREENS.md §24; the web's is
// features/selection/bulk-bar.tsx at phone width): while rows are ticked, a panel docked at the bottom of the
// screen — "3 selected · Done" over two columns of 48-point actions, then the two that need a row of their own, a
// date to pick and a tag to add. Every action is one write with one undo entry, then the ticks clear. What each
// action writes and the words of its toast are the web's own (bulk-actions.ts); this draws them and says what was
// picked. Presentational.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatMinutes, type LocalDate } from "@/core/time";
import { BULK_PRIORITIES, bulkDay, bulkEstimate, bulkPriority, bulkTagName, bulkToday, bulkTomorrow, type BulkWrite } from "@/features/selection/bulk-actions";
import { ESTIMATE_PRESETS } from "@/features/tasks/estimate-presets";
import { Button } from "~/ui/button";
import { MenuRow } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";
import { TextField } from "~/ui/text-field";
import { TARGET, font, useColours, useShadows } from "~/ui/theme";
import { DateSheet } from "./row-sheets";

export interface BulkBarProps {
  /** How many rows are ticked; the bar is drawn only while some are. */
  count: number;
  today: LocalDate;
  /** Room under the bar for the phone's own bottom strip (a pushed screen); a tab's screen sits over the tab bar. */
  bottomInset?: number;
  /** A day, a priority or an estimate for every ticked task. */
  onWrite: (write: BulkWrite) => void;
  /** Project…: the frame opens the project picker for the ticked tasks. */
  onProject: () => void;
  onTag: (name: string) => void;
  onComplete: () => void;
  onSomeday: () => void;
  onDrop: () => void;
  /** Lets go of the ticks without a write. */
  onDone: () => void;
}

export function BulkBar(p: BulkBarProps) {
  const c = useColours();
  const shadows = useShadows();
  const [sheet, setSheet] = useState<"date" | "priority" | "estimate" | null>(null);
  const [tag, setTag] = useState("");
  if (p.count === 0) return null;
  const close = () => setSheet(null);
  const pick = (write: BulkWrite) => {
    close();
    p.onWrite(write);
  };
  const addTag = () => {
    const name = bulkTagName(tag);
    if (!name) return;
    setTag("");
    p.onTag(name);
  };
  const action = (label: string, onPress: () => void, first = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.action, pressed && { backgroundColor: c.surface2 }]}>
      <Text style={[styles.actionText, { color: first ? c.ink : c.ink2 }]}>{label}</Text>
    </Pressable>
  );
  return (
    <>
      <View accessibilityRole="toolbar" accessibilityLabel="Bulk edit" style={[styles.bar, { backgroundColor: c.surface, borderColor: c.lineStrong, paddingBottom: (p.bottomInset ?? 0) + 8, boxShadow: shadows.float ?? undefined }]}>
        {/* What is held, and how to let go. */}
        <View style={[styles.head, { borderBottomColor: c.line }]}>
          <Text accessibilityLiveRegion="polite" style={[styles.count, { color: c.ink2 }]}>
            <Text style={[styles.countNumber, { color: c.ink }]}>{p.count}</Text> selected
          </Text>
          <Button variant="quiet" label="Done" accessibilityLabel="Clear the selection" onPress={p.onDone} />
        </View>
        <View style={styles.grid}>
          {action("Today", () => p.onWrite(bulkToday(p.today)), true)}
          {action("Tomorrow", () => p.onWrite(bulkTomorrow(p.today)))}
          {action("Project…", p.onProject)}
          {action("Priority", () => setSheet("priority"))}
          {action("Estimate", () => setSheet("estimate"))}
          {action("Complete", p.onComplete)}
          {action("Someday", p.onSomeday)}
          {/* Drop is undoable, so it stays ink (DESIGN_SYSTEM.md §2). */}
          {action("Drop", p.onDrop)}
        </View>
        {/* The two fields go last, each on a row of its own. */}
        <View style={styles.fields}>
          <Button label="Pick a date" onPress={() => setSheet("date")} style={styles.field} />
          <TextField accessibilityLabel="Add a tag" placeholder="@tag" value={tag} onChangeText={setTag} autoCorrect={false} autoCapitalize="none" returnKeyType="done" onSubmitEditing={addTag} style={styles.field} />
        </View>
      </View>

      <DateSheet open={sheet === "date"} title="Pick a date" today={p.today} onPick={(day) => pick(bulkDay(day))} onClose={close} />
      <Sheet open={sheet === "priority"} title="Priority" onClose={close} footer={<Button variant="quiet" label="Cancel" onPress={close} />}>
        <View>
          {BULK_PRIORITIES.map((x) => (
            <MenuRow key={x.value} label={x.label} onPress={() => pick(bulkPriority(x))} />
          ))}
        </View>
      </Sheet>
      <Sheet open={sheet === "estimate"} title="Estimate" onClose={close} footer={<Button variant="quiet" label="Cancel" onPress={close} />}>
        <View>
          {ESTIMATE_PRESETS.map((m) => (
            <MenuRow key={m} label={formatMinutes(m)} onPress={() => pick(bulkEstimate(m))} />
          ))}
          <MenuRow label="No estimate" onPress={() => pick(bulkEstimate(null))} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0 },
  head: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  count: { fontFamily: font.regular, fontSize: 16, fontVariant: ["tabular-nums"] },
  countNumber: { fontFamily: font.semibold },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, paddingTop: 6 },
  action: { width: "50%", minHeight: Math.max(48, TARGET), justifyContent: "center", paddingHorizontal: 12, borderRadius: 12 },
  actionText: { fontFamily: font.medium, fontSize: 16 },
  fields: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  field: { alignSelf: "stretch" },
});
