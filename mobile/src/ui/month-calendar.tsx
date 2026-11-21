// A month to pick a day from (the phone's stand-in for the web's date field, which opens the browser's own picker):
// the month's name between two arrows, the weekdays from Monday, and every day a 44-point target. Today is ringed,
// the chosen day is filled, and a day before `min` cannot be chosen. It opens on the chosen day's month, or today's.
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { compareDates, type LocalDate } from "@/core/time";
import { formatDay, monthName } from "@/core/time/format-day";
import { Icon } from "./icon";
import { monthWeeks } from "./month-grid";
import { TARGET, font, useColours } from "./theme";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function MonthCalendar({ value, today, min, onPick }: { value: LocalDate | null; today: LocalDate; /** The first day that can be chosen. */ min?: LocalDate; onPick: (day: LocalDate) => void }) {
  const c = useColours();
  const [month, setMonth] = useState(() => (value ?? today).with({ day: 1 }));
  // A day chosen from outside (a preset, a typed date) brings its month into view.
  const [seen, setSeen] = useState(value?.toString() ?? "");
  if (seen !== (value?.toString() ?? "")) {
    setSeen(value?.toString() ?? "");
    if (value) setMonth(value.with({ day: 1 }));
  }
  const title = `${monthName(month, "long")} ${month.year}`;
  const canGoBack = !min || compareDates(month, min.with({ day: 1 })) > 0;
  return (
    <View accessibilityLabel="Calendar">
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" accessibilityState={{ disabled: !canGoBack }} disabled={!canGoBack} onPress={() => setMonth(month.subtract({ months: 1 }))} style={[styles.arrow, !canGoBack && styles.faded]}>
          <Icon name="arrow-left" size={20} color={c.ink2} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
          {title}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setMonth(month.add({ months: 1 }))} style={styles.arrow}>
          <Icon name="arrow-right" size={20} color={c.ink2} />
        </Pressable>
      </View>
      <View aria-hidden style={styles.week}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={[styles.weekday, { color: c.ink3 }]}>
            {d}
          </Text>
        ))}
      </View>
      {monthWeeks(month).map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((day, i) => {
            if (!day) return <View key={i} style={styles.cell} />;
            const chosen = value?.equals(day) ?? false;
            const isToday = day.equals(today);
            const off = Boolean(min && compareDates(day, min) < 0);
            return (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${formatDay(day, { weekday: "long", month: "long", year: true })}${isToday ? ", today" : ""}`}
                accessibilityState={{ selected: chosen, disabled: off }}
                disabled={off}
                onPress={() => onPick(day)}
                style={styles.cell}
              >
                <View style={[styles.day, isToday && { borderWidth: 1.4, borderColor: c.lineControl }, chosen && { backgroundColor: c.ink, borderColor: c.ink }]}>
                  <Text style={[styles.dayText, { color: chosen ? c.paper : off ? c.ink4 : c.ink, fontFamily: chosen || isToday ? font.semibold : font.medium }]}>{day.day}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arrow: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  faded: { opacity: 0.35 },
  title: { fontFamily: font.semibold, fontSize: 17 },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.6, paddingVertical: 4 },
  cell: { flex: 1, height: TARGET, alignItems: "center", justifyContent: "center" },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 16, fontVariant: ["tabular-nums"] },
});
