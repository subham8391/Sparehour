// Two chips that are controls (DESIGN_SYSTEM.md §5 "Chips"), beside the read-only Chip of a row. ChipButton is a
// suggestion to tap (a token to write into a line, a project to pick): an outlined pill, 44 points high, an ink edge
// once it is chosen. RemovableChip is something already said that can be taken off (a parsed fact, a filter): its
// words, an optional glyph before them, and a × that is its own 44-point target. ChipRow lays either out in one row
// that scrolls sideways, as the web's chip rows do at phone width.
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "./icon";
import { TARGET, font, useColours } from "./theme";

export function ChipButton({ label, onPress, icon, chosen = false, accessibilityLabel }: { label: string; onPress: () => void; icon?: IconName; /** The choice already made: an ink edge. */ chosen?: boolean; accessibilityLabel?: string }) {
  const c = useColours();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: chosen }}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { borderColor: chosen ? c.ink : c.line, backgroundColor: chosen || pressed ? c.surface2 : "transparent" }]}
    >
      {icon ? <Icon name={icon} size={14} color={c.ink2} strokeWidth={2} /> : null}
      <Text numberOfLines={1} style={[styles.buttonText, { color: c.ink }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function RemovableChip({ label, icon, quiet = false, tone, onRemove, removeLabel, removeHint }: { label: string; icon?: IconName; /** A recognised project wears the meeting colour, as on the web's strip. */ tone?: "meet"; /** Filled and quiet (a fact restated) rather than outlined (a control that was set). */ quiet?: boolean; /** Left out, the chip only says. */ onRemove?: () => void; /** What the × is called: "Remove “Tomorrow”". */ removeLabel?: string; /** What taking it off does, when that is not plain: "Keep these words in the title". */ removeHint?: string }) {
  const c = useColours();
  return (
    <View style={[styles.chip, tone === "meet" ? { backgroundColor: c.meetSoft, borderColor: c.meetSoft } : quiet ? { backgroundColor: c.surface2, borderColor: c.surface2 } : { borderColor: c.lineControl }, !onRemove && styles.chipPlain]}>
      {icon ? <Icon name={icon} size={14} color={c.ink3} /> : null}
      <Text numberOfLines={1} style={[styles.chipText, { color: tone === "meet" ? c.meet : quiet ? c.ink2 : c.ink }]}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={removeLabel ?? `Remove ${label}`} accessibilityHint={removeHint} onPress={onRemove} style={styles.remove}>
          <Icon name="close" size={14} color={c.ink3} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** One row of chips that scrolls sideways; a tap on a chip never takes the keyboard down. */
export function ChipRow({ label, children }: { /** What the chips are, for a screen reader: "Suggestions". */ label: string; children: ReactNode }) {
  return (
    <ScrollView horizontal accessibilityLabel={label} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: TARGET, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6 },
  buttonText: { fontFamily: font.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingLeft: 12, minHeight: TARGET, maxWidth: "100%" },
  chipPlain: { paddingRight: 12 },
  chipText: { flexShrink: 1, fontFamily: font.medium, fontSize: 14, fontVariant: ["tabular-nums"] },
  remove: { width: TARGET, height: TARGET, marginLeft: -8, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 8 },
});
