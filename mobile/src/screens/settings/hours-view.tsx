// Settings › Working hours on the phone (SCREENS.md §18: "working hours become a per-day picker"; the web's
// sections/hours-section.tsx): each day on or off with its stretches on one line, and a sheet per day where up to
// three stretches are set; the buffer with its live preview; when the evening starts and ends, when the day starts,
// and the first day of the week. A day's stretches save together. What an edit saves, the joining of overlapping
// stretches when the day is left (here: when its sheet closes) and every word are the web's own
// (features/settings/work-day.ts, settings-rules.ts, section-words.ts). Presentational.
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import type { SettingsPatch } from "@/data/repositories/settings-repo";
import { useSavedFlash } from "@/features/settings/saved-flash";
import { BUFFER, EVENING_ENDS_HINT, workingDayLabel } from "@/features/settings/section-words";
import { ROLLOVER_HOURS, WEEKDAYS, bufferPreview, longestDayMinutes, rolloverLabel, segmentsLabel, type Segment } from "@/features/settings/settings-rules";
import type { SettingsValues } from "@/features/settings/settings-values";
import { useWorkDay } from "@/features/settings/work-day";
import { Button } from "~/ui/button";
import { CardRow } from "~/ui/card";
import { CheckBox } from "~/ui/check-box";
import { IconButton } from "~/ui/screen";
import { Sheet } from "~/ui/sheet";
import { Stepper } from "~/ui/stepper";
import { font, useColours } from "~/ui/theme";
import { TimePicker } from "~/ui/time-picker";
import { ChoiceSheet, Group, Line, QuietRow, SettingRow, TimeSheet } from "./parts";

export interface HoursViewProps {
  values: SettingsValues;
  /** Each weekday's stretches in start order (0 = Monday); an empty list is a day off. */
  workHours: readonly (readonly Segment[])[];
  onChange: (patch: SettingsPatch) => void;
  onWorkHours: (weekday: number, segments: Segment[]) => void;
}

type Open = "evening" | "evening-ends" | "rollover" | "week-start" | null;

export function HoursView({ values, workHours, onChange, onWorkHours }: HoursViewProps) {
  const [saved, flash] = useSavedFlash();
  const [open, setOpen] = useState<Open>(null);
  const change = (patch: SettingsPatch) => {
    onChange(patch);
    flash();
  };
  const close = () => setOpen(null);
  const longest = longestDayMinutes(workHours);
  return (
    <>
      <Group saved={saved}>
        {WEEKDAYS.map((name, weekday) => (
          <CardRow key={name} first={weekday === 0}>
            <DayRow
              name={name}
              segments={workHours[weekday] ?? []}
              onChange={(segments) => {
                onWorkHours(weekday, segments);
                flash();
              }}
            />
          </CardRow>
        ))}
        <CardRow>
          <SettingRow label="Buffer for the unexpected" hint={bufferPreview(values.bufferPct, longest)}>
            <View style={styles.under}>
              <Stepper
                label="Buffer"
                value={`${values.bufferPct}%`}
                onStep={(direction) => change({ bufferPct: Math.max(BUFFER.min, Math.min(BUFFER.max, values.bufferPct + direction * BUFFER.step)) })}
                canDown={values.bufferPct > BUFFER.min}
                canUp={values.bufferPct < BUFFER.max}
              />
            </View>
          </SettingRow>
        </CardRow>
        <CardRow>
          <SettingRow label="Evening starts at" value={values.eveningStartsAt} onPress={() => setOpen("evening")} />
        </CardRow>
        <CardRow>
          <SettingRow label="Evening ends at" hint={EVENING_ENDS_HINT} value={values.eveningEndsAt} onPress={() => setOpen("evening-ends")} />
        </CardRow>
        <CardRow>
          <SettingRow label="Day starts at" value={rolloverLabel(values.dayRolloverHour)} onPress={() => setOpen("rollover")} />
        </CardRow>
        <CardRow>
          <SettingRow label="Week starts on" value={WEEKDAYS[values.weekStart] ?? WEEKDAYS[0]} onPress={() => setOpen("week-start")} />
        </CardRow>
      </Group>
      <TimeSheet open={open === "evening"} title="Evening starts at" value={values.eveningStartsAt} onSet={(v) => change({ eveningStartsAt: v })} onClose={close} />
      <TimeSheet open={open === "evening-ends"} title="Evening ends at" value={values.eveningEndsAt} onSet={(v) => change({ eveningEndsAt: v })} onClose={close} />
      <ChoiceSheet open={open === "rollover"} title="Day starts at" options={ROLLOVER_HOURS.map((h) => ({ value: h as number, label: rolloverLabel(h) }))} value={values.dayRolloverHour} onChange={(h) => change({ dayRolloverHour: h })} onClose={close} />
      <ChoiceSheet open={open === "week-start"} title="Week starts on" options={WEEKDAYS.map((label, value) => ({ value, label }))} value={values.weekStart} onChange={(d) => change({ weekStart: d })} onClose={close} />
    </>
  );
}

/**
 * One weekday: its box turns it on or off, and the rest of the row opens its stretches. Leaving the sheet is
 * leaving the day: overlapping stretches are joined then, and the row says so.
 */
export function DayRow({ name, segments, onChange }: { name: string; segments: readonly Segment[]; onChange: (segments: Segment[]) => void }) {
  const day = useWorkDay(segments, onChange);
  const [open, setOpen] = useState(false);
  // The stretch end being set in the day's sheet: the picker takes the sheet's place, so one sheet never opens over another.
  const [picking, setPicking] = useState<{ index: number; part: "start" | "end" } | null>(null);
  const close = () => {
    setPicking(null);
    setOpen(false);
    day.settle();
  };
  const partLabel = (part: "start" | "end", i: number) => (i === 0 ? `${name} ${part}` : `${name} ${part} ${i + 1}`);
  const picked = picking ? day.draft[picking.index] : undefined;
  return (
    <View>
      <View style={styles.day}>
        <CheckBox checked={day.on} onChange={day.toggle} accessibilityLabel={workingDayLabel(name)} />
        <View style={styles.dayRow}>
          {day.on ? <SettingRow label={name} value={segmentsLabel(segments)} accessibilityLabel={`${name} hours`} onPress={() => setOpen(true)} /> : <SettingRow label={name} value="Off" quiet />}
        </View>
      </View>
      {day.on && day.error && !open ? <QuietRow text={day.error} tone="error" /> : null}
      {day.note ? <QuietRow text={day.note} status /> : null}
      <Sheet open={open} title={picking ? partLabel(picking.part, picking.index) : name} onClose={close} footer={picking ? <Button variant="quiet" label="Back" onPress={() => setPicking(null)} /> : <Button variant="quiet" label="Done" onPress={close} />}>
        {picking && picked ? (
          <TimePicker
            key={`${picking.index}-${picking.part}`}
            value={picked[picking.part]}
            onSet={(v) => {
              if (v) day.edit(picking.index, { [picking.part]: v });
              setPicking(null);
            }}
          />
        ) : (
          <View style={styles.gap}>
            {day.draft.map((seg, i) => (
              <View key={i} style={styles.stretch}>
                <Button label={seg.start} accessibilityLabel={`${partLabel("start", i)}, ${seg.start}`} onPress={() => setPicking({ index: i, part: "start" })} style={styles.time} />
                <DashText />
                <Button label={seg.end} accessibilityLabel={`${partLabel("end", i)}, ${seg.end}`} onPress={() => setPicking({ index: i, part: "end" })} style={styles.time} />
                {day.draft.length > 1 ? <IconButton icon="close" label={`Remove ${name} ${seg.start}–${seg.end}`} onPress={() => day.remove(i)} /> : <View style={styles.noRemove} />}
              </View>
            ))}
            {day.next ? <Button variant="quiet" label="Add hours" onPress={day.add} style={styles.add} /> : null}
            {day.error ? <Line text={day.error} tone="error" flush /> : null}
          </View>
        )}
      </Sheet>
    </View>
  );
}

function DashText() {
  const c = useColours();
  return <Text style={[styles.dash, { color: c.ink3 }]}>–</Text>;
}

const styles = StyleSheet.create({
  under: { alignItems: "flex-start" },
  day: { flexDirection: "row", alignItems: "center", paddingLeft: 4 },
  dayRow: { flex: 1, marginLeft: -8 },
  gap: { gap: 10 },
  stretch: { flexDirection: "row", alignItems: "center", gap: 8 },
  time: { flex: 1 },
  dash: { fontFamily: font.regular, fontSize: 17 },
  noRemove: { width: 44 },
  add: { alignSelf: "flex-start" },
});
