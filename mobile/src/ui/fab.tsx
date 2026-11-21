// The round add button at the bottom right of a list (DESIGN_SYSTEM.md §5 "Add"): Today, Inbox and the Week. Its
// fill, its plus and its shadow are the look's own (`--fab`, `--fab-ink`, the fab shadow), so a look that draws it
// in its accent colour does so here too.
import { Pressable, StyleSheet } from "react-native";
import { Icon } from "./icon";
import { useColours, useShadows } from "./theme";

export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColours();
  const shadows = useShadows();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.fab, { backgroundColor: c.fab, boxShadow: shadows.fab ?? undefined }]}>
      <Icon name="plus" size={26} color={c.fabInk} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: { position: "absolute", right: 20, bottom: 20, width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
