// A number moved a step at a time (DESIGN_SYSTEM.md §5; where the web has a slider or a number field): the value
// between a 44-point minus and plus. An end of the range turns its button off. Each button says what it changes
// ("Buffer, less"), and the value is read out again as it moves.
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { TARGET, font, useColours } from "./theme";

export function Stepper({ label, value, says, onStep, canDown = true, canUp = true }: { /** What is being set: "Buffer". */ label: string; /** The value as it is drawn: "15%". */ value: string; /** What a screen reader hears for it, when the drawn one is short. */ says?: string; onStep: (direction: -1 | 1) => void; canDown?: boolean; canUp?: boolean }) {
  const c = useColours();
  const side = (direction: -1 | 1, on: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${direction < 0 ? "less" : "more"}`}
      accessibilityState={{ disabled: !on }}
      disabled={!on}
      onPress={() => onStep(direction)}
      style={({ pressed }) => [styles.side, { borderColor: c.lineControl, opacity: on ? (pressed ? 0.7 : 1) : 0.4 }]}
    >
      <Text style={[styles.glyph, { color: c.ink }]}>{direction < 0 ? "−" : "+"}</Text>
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {side(-1, canDown)}
      <Text accessibilityLabel={`${label} ${says ?? value}`} accessibilityLiveRegion="polite" style={[styles.value, { color: c.ink }]}>
        {value}
      </Text>
      {side(1, canUp)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  side: { width: TARGET, height: TARGET, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  glyph: { fontFamily: font.semibold, fontSize: 20, lineHeight: 24 },
  value: { minWidth: 56, textAlign: "center", fontFamily: font.semibold, fontSize: 17, fontVariant: ["tabular-nums"] },
});
