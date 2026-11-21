// "Took" under a completion's toast (DECISIONS.md, amendment 2026-11-15; the web's is features/took/took-chips.tsx):
// one optional tap says how long the task really took. Four lengths around what it was counted as, and More for the
// rest of the presets; the pressed one is the answer, pressing it again takes the answer back, and Undo on the toast
// takes it back with the completion. Which lengths are offered, the row the answer is written on and the write
// itself are the web's own (core/estimates, data/repositories/took.ts); this draws the chips.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { tookChoices } from "@/core/estimates";
import { formatMinutes } from "@/core/time";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { tookRow, writeTook, type TookAsk, type TookRow } from "@/data/repositories/took";
import { learnedIsOld } from "@/features/estimates/learned-store";
import { ESTIMATE_PRESETS } from "@/features/tasks/estimate-presets";
import { TARGET, font, useColours } from "./theme";

export function TookChips({ ask, onTouch }: { ask: TookAsk; /** A chip was pressed: the toast gets its full time back. */ onTouch?: () => void }) {
  const c = useColours();
  // Outside the database provider (tests, the sign-in screen) there is nothing to write on.
  const db = useLocalDatabase() as LocalDatabase | null | undefined;
  const [row, setRow] = useState<TookRow | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [all, setAll] = useState(false);

  // Read at once, while the finished row is still on the phone: sync takes it away a moment after it uploads.
  useEffect(() => {
    if (!db) return;
    let here = true;
    tookRow(db, ask).then(
      (found) => {
        if (!here || !found) return;
        setRow(found);
        setPicked(found.actualMin);
      },
      // Unreadable is the same as not there: the toast keeps its words and Undo, and asks nothing.
      () => undefined,
    );
    return () => {
      here = false;
    };
  }, [db, ask]);

  if (!db || !row) return null;
  const lengths = all ? [...new Set([...ESTIMATE_PRESETS, ...(picked == null ? [] : [picked])])].sort((a, b) => a - b) : tookChoices(row.estimateMin, row.defaultMin);
  const choose = (minutes: number) => {
    const next = picked === minutes ? null : minutes;
    const was = picked;
    setPicked(next);
    onTouch?.();
    // What the estimates learned is asked for again the next time it is looked at: this length is part of it now.
    writeTook(db, ask, row.snapshot, next, was).then(learnedIsOld, () => setPicked(was));
  };
  const chip = (label: string, onPress: () => void, state: { selected?: boolean; expanded?: boolean }, key?: number) => (
    <Pressable key={key} accessibilityRole="button" accessibilityLabel={label} accessibilityState={state} onPress={onPress} style={styles.target}>
      <View style={[styles.chip, { borderColor: state.selected ? c.ink : c.line, backgroundColor: state.selected ? c.surface2 : "transparent" }]}>
        <Text style={[styles.chipText, { color: c.ink }]}>{label}</Text>
      </View>
    </Pressable>
  );
  const chips = (
    <>
      <Text style={[styles.label, { color: c.ink2 }]}>Took</Text>
      {lengths.map((m) => chip(formatMinutes(m), () => choose(m), { selected: picked === m }, m))}
      {chip(all ? "Fewer" : "More", () => (onTouch?.(), setAll((v) => !v)), { expanded: all })}
    </>
  );
  // The four lengths stay on one line that scrolls sideways, so the toast covers two rows of the list, not three;
  // More asks for the rest, and those wrap.
  return all ? (
    <View accessibilityLabel="How long it took" style={[styles.row, styles.wrap]}>
      {chips}
    </View>
  ) : (
    <ScrollView horizontal accessibilityLabel="How long it took" keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 10, paddingBottom: 4 },
  wrap: { flexWrap: "wrap" },
  label: { fontFamily: font.regular, fontSize: 14, marginRight: 6 },
  // A 44-point target around a chip that is drawn smaller.
  target: { minHeight: TARGET, justifyContent: "center", paddingHorizontal: 3 },
  chip: { height: 30, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, justifyContent: "center" },
  chipText: { fontFamily: font.medium, fontSize: 14, fontVariant: ["tabular-nums"] },
});
