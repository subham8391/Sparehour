// A row that goes somewhere (DESIGN_SYSTEM.md §5 "Navigation", Browse at phone width): 48 points high in a list
// card, an icon or a project's dot before its words, a quiet count or a word after them, then the chevron. A row
// with nowhere to go (a heading over the rows under it) is drawn without the chevron and is not a button. `trailing`
// is a second target of its own at the far edge (a row's ⋯).
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "./icon";
import { TARGET, font, useColours } from "./theme";

export interface NavRowProps {
  label: string;
  /** Left out for a heading: plain words, no chevron. */
  onPress?: () => void;
  icon?: IconName;
  /** The 6-point dot a project carries wherever it is listed. */
  dot?: boolean;
  /** One step in, under the row it belongs to (a project under its area). */
  indent?: boolean;
  /** A quiet number after the words; nothing for zero is the caller's choice. */
  count?: number;
  /** A quiet word after the words ("Archived"). */
  note?: string;
  /** Medium weight in ink (an area, a view) or regular in ink-2 (a project). */
  quiet?: boolean;
  accessibilityLabel?: string;
  trailing?: ReactNode;
}

export function NavRow({ label, onPress, icon, dot = false, indent = false, count, note, quiet = false, accessibilityLabel, trailing }: NavRowProps) {
  const c = useColours();
  const inner = (
    <>
      {icon ? <Icon name={icon} size={20} color={c.ink2} /> : null}
      {dot ? <View style={[styles.dot, { backgroundColor: c.lineControl }]} /> : null}
      <Text numberOfLines={1} style={[styles.label, { color: quiet ? c.ink2 : c.ink, fontFamily: quiet ? font.regular : font.medium }]}>
        {label}
      </Text>
      {count !== undefined ? <Text style={[styles.count, { color: c.ink3 }]}>{count}</Text> : null}
      {note ? <Text style={[styles.count, { color: c.ink3 }]}>{note}</Text> : null}
      {onPress ? <Icon name="chevron-right" size={16} color={c.ink3} /> : null}
    </>
  );
  const pad = { paddingLeft: indent ? 36 : 16, paddingRight: trailing ? 4 : 14 };
  return (
    <View style={styles.row}>
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={({ pressed }) => [styles.main, pad, pressed && { backgroundColor: c.surface2 }]}>
          {inner}
        </Pressable>
      ) : (
        <View accessible accessibilityRole="header" accessibilityLabel={accessibilityLabel ?? label} style={[styles.main, pad]}>
          {inner}
        </View>
      )}
      {trailing}
    </View>
  );
}

/** A row's own ⋯ at its far edge: a 44-point target that opens what can be done with the row. */
export function RowMore({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColours();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.more}>
      <Icon name="more" size={20} color={c.ink2} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  main: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { flex: 1, fontSize: 17 },
  count: { fontFamily: font.regular, fontSize: 14, fontVariant: ["tabular-nums"] },
  more: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center", marginRight: 4 },
});
