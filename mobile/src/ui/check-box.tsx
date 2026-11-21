// A checkbox (DESIGN_SYSTEM.md §5): a rounded square, filled ink with its tick when it is on, in a 44-point target.
// For a step of a checklist or a setting that is on or off; a task is completed by its ring (task-line.tsx), not this.
import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "./icon";
import { TARGET, useColours } from "./theme";

export function CheckBox({ checked, onChange, accessibilityLabel }: { checked: boolean; onChange: (checked: boolean) => void; accessibilityLabel: string }) {
  const c = useColours();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={styles.target}>
      <View style={[styles.box, { borderColor: checked ? c.ink : c.lineControl, backgroundColor: checked ? c.ink : "transparent" }]}>{checked && <Icon name="check" size={14} color={c.paper} strokeWidth={2.4} />}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.6, alignItems: "center", justifyContent: "center" },
});
