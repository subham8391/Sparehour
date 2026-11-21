// A row that goes somewhere and says, under its name, what is there now (DESIGN_SYSTEM.md §4a "Settings": the
// section list on a phone, "Working hours" over "Mon–Fri · 09:00–18:00 · buffer 15%"): 56 points high in a list
// card, the name, one quiet line cut to the row's width, then the chevron. NavRow is the one-line row.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "./icon";
import { font, useColours } from "./theme";

export function SummaryRow({ label, summary, onPress, accessibilityLabel }: { label: string; /** The quiet line under the name. */ summary?: string; onPress: () => void; accessibilityLabel?: string }) {
  const c = useColours();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={summary} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surface2 }]}>
      <View style={styles.words}>
        <Text numberOfLines={1} style={[styles.label, { color: c.ink }]}>
          {label}
        </Text>
        {summary ? (
          <Text numberOfLines={1} style={[styles.summary, { color: c.ink2 }]}>
            {summary}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={16} color={c.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: 14, paddingVertical: 8 },
  words: { flex: 1 },
  label: { fontFamily: font.medium, fontSize: 18, lineHeight: 24 },
  summary: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
});
