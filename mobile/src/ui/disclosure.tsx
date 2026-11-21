// A section that folds (DESIGN_SYSTEM.md §5; Today's This evening on a phone, SCREENS.md §2.8): the section's own
// label line ("THIS EVENING 2 · 40m") as a 44-point target with a chevron, and under it whatever it holds while it is
// open. Whoever uses it holds whether it is open, so the choice can be remembered; CollapsedGroup is the part for a
// group that simply starts folded.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { Icon } from "./icon";
import { TARGET, font, useColours } from "./theme";

export function Disclosure({ label, count, detail, open, onToggle, children }: { label: string; count?: number; /** After a middle dot: "40m". */ detail?: string; open: boolean; onToggle: (open: boolean) => void; children: ReactNode }) {
  const c = useColours();
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityLabel={[label, count, detail].filter((x) => x !== undefined && x !== "").join(", ")} accessibilityState={{ expanded: open }} onPress={() => onToggle(!open)} style={styles.head}>
        <Text style={[styles.label, { color: c.ink3 }]}>
          {label.toUpperCase()}
          {count !== undefined && <Text style={{ color: c.ink }}> {count}</Text>}
          {detail ? ` · ${detail}` : ""}
        </Text>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={16} color={c.ink3} />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The section label's own measures (section-label.tsx), in a full target.
  head: { minHeight: TARGET, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10, marginHorizontal: 22 },
  label: { flex: 1, fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3, fontVariant: ["tabular-nums"] },
});
