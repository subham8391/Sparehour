// A setting that is on or off (DESIGN_SYSTEM.md §4a "Settings: grouped list"): its name at the near edge, a quiet
// line under it when there is more to say, and the switch at the far edge. The whole row is the target (52 points
// at least), and it is one switch to a screen reader, named by the row.
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { Text } from "./text";
import { font, useColours } from "./theme";

export function SwitchRow({ label, hint, checked, onChange, disabled = false, accessibilityLabel }: { label: string; /** The second line under the name. */ hint?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; accessibilityLabel?: string }) {
  const c = useColours();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surface2 }]}
    >
      <View style={styles.words}>
        <Text style={[styles.label, { color: disabled ? c.ink3 : c.ink }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: c.ink2 }]}>{hint}</Text> : null}
      </View>
      {/* The row takes the tap; the switch only shows the value, so one tap is never counted twice. */}
      <View pointerEvents="none" aria-hidden>
        <Switch value={checked} disabled={disabled} trackColor={{ false: c.lineStrong, true: c.ink }} thumbColor={c.surface} ios_backgroundColor={c.lineStrong} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  words: { flex: 1 },
  label: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  hint: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginTop: 1 },
});
