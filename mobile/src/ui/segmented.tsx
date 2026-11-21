// A segmented control (DESIGN_SYSTEM.md §5): a few choices of which one is always made, side by side at 44 points,
// the chosen one lifted onto the surface. A radio group to a screen reader.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TARGET, font, useColours } from "./theme";

export function Segmented<T extends string>({ label, options, value, onChange }: { /** What the choice is of: "Show". */ label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const c = useColours();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.track, { backgroundColor: c.surface2, borderColor: c.line }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ checked: on }} onPress={() => !on && onChange(o.value)} style={[styles.option, on && { backgroundColor: c.surface, borderColor: c.lineStrong }]}>
            <Text style={[styles.text, { color: on ? c.ink : c.ink2, fontFamily: on ? font.semibold : font.medium }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderWidth: 1, borderRadius: 12, padding: 2, gap: 2 },
  option: { flex: 1, minHeight: TARGET - 4, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "transparent" },
  text: { fontSize: 15 },
});
