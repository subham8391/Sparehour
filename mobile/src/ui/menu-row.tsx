// One line of a menu in a sheet (DESIGN_SYSTEM.md §5, the row's ⋯ menu and the pickers at phone width): 48 points
// high, its words at the near edge with an optional icon before them, and at the far edge a quiet word or the tick
// of the choice already made. MenuHeading names a group of lines; MenuDivider is the hairline between two groups.
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { Icon, type IconName } from "./icon";
import { font, useColours } from "./theme";

export function MenuRow({ label, onPress, icon, hint, current = false, accessibilityLabel }: { label: string; onPress: () => void; icon?: IconName; /** A quiet word at the far edge ("Area"). */ hint?: string; /** The choice already made: ticked. */ current?: boolean; accessibilityLabel?: string }) {
  const c = useColours();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected: current }} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surface2 }]}>
      {icon ? <Icon name={icon} size={20} color={c.ink3} /> : null}
      <Text numberOfLines={1} style={[styles.label, { color: c.ink }]}>
        {label}
      </Text>
      {hint ? <Text style={[styles.hint, { color: c.ink3 }]}>{hint}</Text> : null}
      {current ? <Icon name="check" size={18} color={c.ink} strokeWidth={2} /> : null}
    </Pressable>
  );
}

export function MenuHeading({ label }: { label: string }) {
  const c = useColours();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: c.ink3 }]}>
      {label.toUpperCase()}
    </Text>
  );
}

export function MenuDivider() {
  const c = useColours();
  return <View style={[styles.divider, { backgroundColor: c.line }]} />;
}

const styles = StyleSheet.create({
  // The sheet's body has 20 points at each side; a line's wash runs 8 of them out, so its words stay on the title's edge.
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 },
  label: { flex: 1, fontFamily: font.medium, fontSize: 17 },
  hint: { fontFamily: font.regular, fontSize: 14 },
  heading: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3, marginTop: 8 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
