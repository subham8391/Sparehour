// A day's capacity as the week draws it (SCREENS.md §3 "Capacity bar"): a 6-point bar in the ribbon's own language
// (the spare track, meetings, blocks, an amber tail past the end of an over day) and the one-line readout beside it.
// A day without working hours is a flat grey track. The bar is hidden from a screen reader; the readout says it.
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Text } from "~/ui/text";
import type { Capacity } from "@/core/capacity";
import type { DayReadout } from "@/features/upcoming/week";
import { font, useColours } from "~/ui/theme";
import { dayBarShape } from "./day-bar-shape";

export function DayBar({ c: capacity, readout, style }: { c: Capacity; readout: DayReadout; style?: StyleProp<ViewStyle> }) {
  const c = useColours();
  const shape = dayBarShape(capacity, readout);
  if (shape.kind === "off") return <View aria-hidden testID="day-bar-off" style={[styles.bar, styles.round, { backgroundColor: c.surface2 }, style]} />;
  return (
    <View aria-hidden testID={`day-bar-${shape.kind}`} style={[styles.bar, style]}>
      <View style={[styles.track, styles.round, { backgroundColor: c.spareSoft }]}>
        {shape.segments.map((s, i) => (
          <View key={i} style={[styles.segment, { left: `${s.left}%`, width: `${s.width}%`, backgroundColor: s.kind === "meeting" ? c.meetFill : c.blockFill }]} />
        ))}
      </View>
      {shape.tail > 0 && <View style={[styles.tail, { width: `${shape.tail}%`, backgroundColor: c.overFill }]} />}
    </View>
  );
}

/** "3h 20m spare" in the spare colour, "40m over" in the over colour, "no working hours" quiet. Never red. */
export function ReadoutText({ readout, style }: { readout: DayReadout; style?: StyleProp<TextStyle> }) {
  const c = useColours();
  const colour = readout.kind === "over" ? c.over : readout.kind === "off" ? c.ink3 : readout.min === 0 ? c.ink2 : c.spare;
  return <Text style={[styles.readout, { color: colour, fontFamily: readout.kind === "off" ? font.regular : font.medium }, style]}>{readout.text}</Text>;
}

const styles = StyleSheet.create({
  bar: { height: 6, flexDirection: "row" },
  round: { borderRadius: 3 },
  track: { flex: 1, overflow: "hidden" },
  segment: { position: "absolute", top: 0, bottom: 0, borderRadius: 3 },
  tail: { minWidth: 3, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  readout: { fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"] },
});
