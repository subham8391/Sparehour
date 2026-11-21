// A section's label over its card (DESIGN_SYSTEM.md §5): small capitals, the count in ink, an optional figure after
// a middle dot ("TODAY 3 · 2h 50m"), and an optional action at the far edge ("Clear the slate").
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./text";
import { font, useColours } from "./theme";

export function SectionLabel({ label, count, detail, action }: { label: string; count?: number; detail?: string; action?: ReactNode }) {
  const c = useColours();
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={[styles.label, { color: c.ink3 }]}>
        {label.toUpperCase()}
        {count !== undefined && <Text style={{ color: c.ink }}> {count}</Text>}
        {detail ? ` · ${detail}` : ""}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 8, marginHorizontal: 22, minHeight: 20 },
  label: { flex: 1, fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3, fontVariant: ["tabular-nums"] },
});
