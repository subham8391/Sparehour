// The 7-day strip (SCREENS.md §3 "Responsive"): one cell per day with its weekday, its date and its 6-point capacity
// bar, today ringed in ink. Pinned over the agenda a tap jumps to the day; under a task in the "Not yet planned"
// sheet a tap places the task there. Seven cells fit across 360 points at 44 each. Every cell says its day and its
// readout in words (the web's own, stripCellName); the bar is hidden from a screen reader.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { weekdayName } from "@/core/time/format-day";
import { stripCellName, type StripDay } from "@/features/upcoming/agenda";
import { font, useColours } from "~/ui/theme";
import { DayBar } from "./day-bar";

export function DayStrip({ days, label, onPick, isDisabled, size = "strip" }: { days: readonly StripDay[]; /** The group's name: "Jump to a day", or "Move “X” to". */ label: string; onPick: (day: StripDay) => void; /** A day with nothing to jump to (gone, and empty): shown, quieter, and not a target. */ isDisabled?: (day: StripDay) => boolean; /** `strip` is the pinned strip's taller cell; `pick` the compact one under a task. */ size?: "strip" | "pick" }) {
  const c = useColours();
  return (
    <View accessibilityLabel={label} style={styles.row}>
      {days.map((d) => {
        const off = isDisabled?.(d) ?? false;
        return (
          <Pressable
            key={d.day.toString()}
            accessibilityRole="button"
            accessibilityLabel={stripCellName(d)}
            accessibilityState={{ disabled: off, selected: d.isToday }}
            disabled={off}
            onPress={() => onPick(d)}
            style={({ pressed }) => [styles.cell, size === "strip" ? styles.tall : styles.short, { borderColor: d.isToday ? c.ink : "transparent", opacity: off ? 0.5 : 1 }, pressed && { backgroundColor: c.surface2 }]}
          >
            <Text style={[styles.weekday, { color: d.isToday ? c.ink : c.ink3 }]}>{weekdayName(d.day).toUpperCase()}</Text>
            <Text style={[size === "strip" ? styles.date : styles.dateSmall, { color: c.ink }]}>{d.day.day}</Text>
            {d.capacity && d.readout ? <DayBar c={d.capacity} readout={d.readout} style={styles.bar} /> : <View aria-hidden style={styles.noBar} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  cell: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 3 },
  tall: { minHeight: 58, paddingVertical: 6 },
  short: { minHeight: 46, paddingVertical: 4 },
  weekday: { fontFamily: font.semibold, fontSize: 11, letterSpacing: 0.9 },
  date: { fontFamily: font.semibold, fontSize: 18, lineHeight: 20, fontVariant: ["tabular-nums"] },
  dateSmall: { fontFamily: font.medium, fontSize: 15, lineHeight: 18, fontVariant: ["tabular-nums"] },
  bar: { width: "100%", maxWidth: 36 },
  noBar: { height: 6 },
});
