// A time of day in the app's one format, "HH:MM" (DESIGN_SYSTEM.md §3; the web's is the time wheel, ui/time-wheel.tsx):
// a large readout, the time typed ("1430", "9.30", read by the web's own parseTime), a quarter of an hour back or on,
// Now, and every hour and every fifth minute as a target of its own, so a time is two taps without the keyboard. Set
// writes it; nothing is written while it is being chosen.
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./text";
import { parseTime } from "@/core/time/parse-time";
import { Button } from "./button";
import { TextField } from "./text-field";
import { font, useColours } from "./theme";

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (min: number) => `${pad(Math.floor((((min % 1440) + 1440) % 1440) / 60))}:${pad((((min % 1440) + 1440) % 1440) % 60)}`;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** The clock's time, rounded up to the step: where the picker starts when there is no time yet. */
export function nowRounded(step: number, clock: Date = new Date()): string {
  return toHhmm(Math.ceil((clock.getHours() * 60 + clock.getMinutes()) / step) * step);
}

export function TimePicker({
  value,
  onSet,
  step = 5,
  clear,
  start,
}: {
  /** "HH:MM", or "" for no time. */
  value: string;
  /** A whole "HH:MM", or "" when it is cleared. */
  onSet: (value: string) => void;
  /** Minutes between the minute targets. */
  step?: number;
  /** The words for taking the time away ("No time"); left out where a time has to be chosen. */
  clear?: string;
  /** Where it starts with no time yet; the clock's time, rounded up, when left out. */
  start?: string;
}) {
  const c = useColours();
  const [draft, setDraft] = useState(() => value || start || nowRounded(step));
  const [text, setText] = useState("");
  const [missed, setMissed] = useState(false);
  const hour = Number(draft.slice(0, 2));
  const minute = Number(draft.slice(3, 5));
  const minutes = Array.from({ length: Math.floor(60 / step) }, (_, i) => i * step);
  const move = (next: string) => {
    setDraft(next);
    setText("");
    setMissed(false);
  };
  const typed = () => {
    const read = parseTime(text);
    if (read) move(read);
    else if (text.trim()) setMissed(true);
  };
  return (
    <View style={styles.gap}>
      <Text accessibilityLabel={`Time ${draft}`} style={[styles.readout, { color: c.ink }]}>
        {draft}
      </Text>
      <View style={styles.row}>
        <TextField
          accessibilityLabel="Time, typed"
          placeholder="14:30"
          value={text}
          onChangeText={(t) => {
            setText(t);
            setMissed(false);
            // A whole time is taken as it is typed; a loose one ("930") when the keyboard's Done is pressed.
            if (/^\d{1,2}:\d{2}$/.test(t.trim())) {
              const read = parseTime(t);
              if (read) setDraft(read);
            }
          }}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          onSubmitEditing={typed}
          style={styles.field}
        />
        <Button label="−15m" accessibilityLabel="15 minutes earlier" onPress={() => move(toHhmm(toMin(draft) - 15))} style={styles.nudge} />
        <Button label="+15m" accessibilityLabel="15 minutes later" onPress={() => move(toHhmm(toMin(draft) + 15))} style={styles.nudge} />
        <Button label="Now" onPress={() => move(nowRounded(step))} style={styles.nudge} />
      </View>
      {missed ? <Text style={[styles.hint, { color: c.ink2 }]}>Type a time like 14:30 or 930.</Text> : null}
      <Text style={[styles.label, { color: c.ink3 }]}>HOUR</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Hour" style={styles.grid}>
        {HOURS.map((h) => (
          <Button key={h} label={pad(h)} accessibilityLabel={`${pad(h)} hours${h === hour ? ", chosen" : ""}`} variant={h === hour ? "primary" : "secondary"} onPress={() => move(`${pad(h)}:${pad(minute)}`)} style={styles.cell} />
        ))}
      </View>
      <Text style={[styles.label, { color: c.ink3 }]}>MINUTE</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Minute" style={styles.grid}>
        {minutes.map((m) => (
          <Button key={m} label={pad(m)} accessibilityLabel={`${pad(m)} minutes${m === minute ? ", chosen" : ""}`} variant={m === minute ? "primary" : "secondary"} onPress={() => move(`${pad(hour)}:${pad(m)}`)} style={styles.cell} />
        ))}
      </View>
      <View style={styles.row}>
        <Button variant="primary" label={`Set ${draft}`} onPress={() => onSet(draft)} style={styles.set} />
        {clear && value ? <Button variant="quiet" label={clear} onPress={() => onSet("")} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 10 },
  readout: { fontFamily: font.display, fontSize: 34, lineHeight: 40, textAlign: "center", fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  field: { flex: 1, minWidth: 84 },
  nudge: { paddingHorizontal: 10 },
  hint: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // Six to a line at 360 points: the sheet's body is 320 wide, less five 6-point gaps.
  cell: { paddingHorizontal: 0, minHeight: 44, flexBasis: "14%", flexGrow: 1, maxWidth: "15.5%" },
  set: { flex: 1 },
});
