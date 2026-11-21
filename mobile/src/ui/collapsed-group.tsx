// A group that starts folded (DESIGN_SYSTEM.md §5; the Logbook's "Dropped", Browse's "Completed and archived"): one
// 44-point line with its name, its count and a chevron; a tap unfolds what is under it, and another folds it again.
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./icon";
import { TARGET, font, useColours } from "./theme";

export function CollapsedGroup({ label, count, children, onToggle }: { label: string; count?: number; children: ReactNode; onToggle?: (open: boolean) => void }) {
  const c = useColours();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen(!open);
          onToggle?.(!open);
        }}
        style={styles.head}
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} size={16} color={c.ink3} />
        <Text style={[styles.label, { color: c.ink2 }]}>
          {label}
          {count !== undefined ? <Text style={{ color: c.ink3 }}>{`  ${count}`}</Text> : null}
        </Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { minHeight: TARGET, flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 22 },
  label: { fontFamily: font.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
});
