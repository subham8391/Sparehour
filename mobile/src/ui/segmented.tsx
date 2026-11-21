// A segmented control (DESIGN_SYSTEM.md §5): a few choices of which one is always made, side by side at 44 points,
// the chosen one lifted onto the surface. A radio group to a screen reader. Its words are the look's control type, as
// the web's `control-type`: the control face and weight, case and tracking.
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { TARGET, corners, font, useColours, useShadows, useShape } from "./theme";

export function Segmented<T extends string>({ label, options, value, onChange }: { /** What the choice is of: "Show". */ label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  const c = useColours();
  const shape = useShape();
  const shadows = useShadows();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.track, corners(shape.radius.seg), { backgroundColor: c.seg, borderColor: c.segLine, borderWidth: shape.border.seg, boxShadow: shadows.seg ?? undefined }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ checked: on }} onPress={() => !on && onChange(o.value)} style={[styles.option, corners(shape.radius.segOn), on && { backgroundColor: c.segOn, boxShadow: shadows.segOn ?? undefined }]}>
            <Text style={[styles.text, { color: on ? c.segOnInk : c.segInk, letterSpacing: shape.tracking.control * 15 }]}>{shape.controlCase === "uppercase" ? o.label.toUpperCase() : shape.controlCase === "lowercase" ? o.label.toLowerCase() : o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", padding: 4, gap: 2 },
  option: { flex: 1, minHeight: TARGET - 4, alignItems: "center", justifyContent: "center" },
  text: { fontFamily: font.control, fontSize: 15 },
});
