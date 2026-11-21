// A field of a detail screen (DESIGN_SYSTEM.md §5 "Detail panel"): 48 points high in a list card, the field's name at
// the near edge in ink-2 and its value at the far edge, as words or as a chip, with anything more (a time chip) after
// it. A tap opens the field's picker, which on a phone is a bottom sheet. A value that is only a placeholder ("No
// day", "—") is quiet. FieldNote is a line of words between two fields with one action at its far edge.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { Chip, type ChipTone } from "./chip";
import { TARGET, font, useColours } from "./theme";

export interface FieldRowProps {
  label: string;
  /** The value as it is drawn. */
  value: string;
  /** What a screen reader hears for the value, when the drawn one is short for it ("30m?"). */
  says?: string;
  /** The value stands for nothing set yet. */
  quiet?: boolean;
  /** Draws the value as a chip of this tone instead of plain words. */
  chip?: ChipTone;
  /** More after the value: a time, "evening". */
  extra?: ReactNode;
  onPress: () => void;
}

export function FieldRow({ label, value, says, quiet = false, chip, extra, onPress }: FieldRowProps) {
  const c = useColours();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityValue={{ text: says ?? value }} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surface2 }]}>
      <Text style={[styles.label, { color: c.ink2 }]}>{label}</Text>
      <View style={styles.value}>
        {chip ? (
          <Chip tone={chip} label={value} />
        ) : (
          <Text numberOfLines={1} style={[styles.text, quiet ? { color: c.ink3, fontFamily: font.regular } : { color: c.ink }]}>
            {value}
          </Text>
        )}
        {extra}
      </View>
    </Pressable>
  );
}

export function FieldNote({ text, action, onPress }: { text: string; /** The one thing the line offers ("Use 50m"). */ action?: string; onPress?: () => void }) {
  const c = useColours();
  return (
    <View style={styles.note}>
      <Text style={[styles.noteText, { color: c.ink2 }]}>{text}</Text>
      {action && onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onPress} style={styles.noteAction}>
          <Text style={[styles.noteActionText, { color: c.ink }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16 },
  label: { fontFamily: font.regular, fontSize: 17 },
  value: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8 },
  text: { flexShrink: 1, fontFamily: font.medium, fontSize: 17, fontVariant: ["tabular-nums"], textAlign: "right" },
  note: { minHeight: TARGET, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 4 },
  noteText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, paddingVertical: 8, fontVariant: ["tabular-nums"] },
  noteAction: { minHeight: TARGET, paddingHorizontal: 12, justifyContent: "center" },
  noteActionText: { fontFamily: font.semibold, fontSize: 14 },
});
