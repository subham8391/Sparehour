// The small chips on a row (DESIGN_SYSTEM.md §5): an estimate, a time, a deadline. Only a missed deadline is red;
// a guessed estimate is dashed with a question mark, as on the web.
import { StyleSheet, Text, View } from "react-native";
import { font, useColours } from "./theme";

export type ChipTone = "neutral" | "guess" | "time" | "deadline" | "spare" | "over";

export function Chip({ label, tone = "neutral", accessibilityLabel }: { label: string; tone?: ChipTone; accessibilityLabel?: string }) {
  const c = useColours();
  const text = tone === "deadline" ? c.deadline : tone === "spare" ? c.spare : tone === "over" ? c.over : c.ink2;
  return (
    <View style={[styles.chip, { borderColor: tone === "deadline" ? c.deadline : c.line, backgroundColor: tone === "guess" ? "transparent" : c.surface2, borderStyle: tone === "guess" ? "dashed" : "solid" }]}>
      <Text accessibilityLabel={accessibilityLabel} style={[styles.text, { color: text }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, height: 26, justifyContent: "center" },
  text: { fontFamily: font.medium, fontSize: 13, fontVariant: ["tabular-nums"] },
});
