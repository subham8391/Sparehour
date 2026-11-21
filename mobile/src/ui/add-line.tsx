// The "+ add" line that ends a list card (SCREENS.md §9; the web's inline add row): TaskLine's measures, a plus where
// the ring would be and quiet words saying where the new thing goes ("Add a task", "Add to Research"). On the phone
// a tap opens the add sheet; the line itself takes no typing.
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { Icon } from "./icon";
import { font, useColours } from "./theme";

export function AddLine({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColours();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surface2 }]}>
      <View style={styles.slot}>
        <Icon name="plus" size={18} color={c.ink2} />
      </View>
      <Text numberOfLines={1} style={[styles.words, { color: c.ink3 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingRight: 14 },
  slot: { width: 52, alignItems: "center", justifyContent: "center" },
  words: { flex: 1, fontFamily: font.regular, fontSize: 17 },
});
