// Step 1b, "When do you work?", as the phone draws it (ONBOARDING.md §1b; the web's is features/welcome/
// hours-step.tsx): the week as it will be counted, accepted in one tap. A strip of seven day pills (M T W T F S S,
// Monday to Friday on) and one start–end pair for all of them; "Edit my hours" opens a row per day with up to three
// stretches each, for split days (the same day row and day sheet as Settings › Working hours). The zone line names
// the phone's zone, which the account takes on "That's right". Nothing is written until then. Where the week starts
// from, what stops it being saved, the long-day note, the week as saved and every word are the web's own
// (features/welcome/welcome-rules.ts, welcome-words.ts). Presentational.
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { DAY_LETTERS, DAY_NAMES, hoursError, hoursNote, settledWeek, startingHours, stripWeek, type Segment, type Strip } from "@/features/welcome/welcome-rules";
import { HOURS_WORDS } from "@/features/welcome/welcome-words";
import { DayRow } from "~/screens/settings/hours-view";
import { TimeSheet } from "~/screens/settings/parts";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { TARGET, font, useColours } from "~/ui/theme";
import { ZoneSheet } from "~/ui/zone-sheet";
import { StepLine, WelcomeFrame } from "./welcome-frame";

export interface HoursStepViewProps {
  /** The week as saved, Monday first: a new account's Mon–Fri 09:00–18:00. */
  saved: readonly (readonly Segment[])[];
  /** The zone the times are in: the phone's. */
  zone: string;
  onConfirm: (week: Segment[][], zone: string) => void;
  busy?: boolean;
  /** Why the last save failed; the choices stay as they are. */
  failure?: string | null;
}

export function HoursStepView({ saved, zone: proposedZone, onConfirm, busy = false, failure = null }: HoursStepViewProps) {
  const c = useColours();
  const [start] = useState(() => startingHours(saved));
  const [strip, setStrip] = useState<Strip>(start.strip);
  /** The per-day rows once opened (or from the start, when the saved week is more than the strip can say). */
  const [perDay, setPerDay] = useState<Segment[][] | null>(() => (start.perDay ? saved.map((segs) => segs.map((s) => ({ ...s }))) : null));
  const [zone, setZone] = useState(proposedZone);
  const [open, setOpen] = useState<"start" | "end" | "zone" | null>(null);
  const close = () => setOpen(null);

  const week = perDay ?? stripWeek(strip);
  const error = hoursError(week);
  const note = hoursNote(week);

  const toggleDay = (d: number) => setStrip((s) => ({ ...s, days: s.days.map((on, i) => (i === d ? !on : on)) }));
  // A day switched on starts with the strip's pair, as on the web; after that the day row's own edits stand.
  const setDay = (d: number, segs: Segment[]) => setPerDay((w) => (w ? w.map((day, i) => (i === d ? (day.length === 0 && segs.length > 0 ? [{ ...strip.hours }] : segs) : day)) : w));
  const setHour = (part: "start" | "end", value: string) => setStrip((s) => ({ ...s, hours: { ...s.hours, [part]: value } }));

  return (
    <WelcomeFrame
      title={HOURS_WORDS.title}
      lead={HOURS_WORDS.lead}
      footer={
        <>
          {!perDay ? <Button block label={HOURS_WORDS.edit} onPress={() => setPerDay(stripWeek(strip))} /> : null}
          <Button variant="primary" block label={HOURS_WORDS.confirm} disabled={error !== null || busy} onPress={() => onConfirm(settledWeek(week), zone)} />
        </>
      }
    >
      {perDay ? (
        <Card style={styles.card}>
          {DAY_NAMES.map((name, d) => (
            <CardRow key={name} first={d === 0}>
              <DayRow name={name} segments={perDay[d]} onChange={(segs) => setDay(d, segs)} />
            </CardRow>
          ))}
        </Card>
      ) : (
        <View style={styles.strip}>
          <View accessibilityLabel={HOURS_WORDS.days} style={styles.pills}>
            {DAY_NAMES.map((name, d) => {
              const on = strip.days[d];
              return (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  accessibilityState={{ selected: on }}
                  onPress={() => toggleDay(d)}
                  style={({ pressed }) => [styles.pill, { borderColor: on ? c.ink : c.line, backgroundColor: on ? c.surface : pressed ? c.surface2 : "transparent" }]}
                >
                  <Text style={[styles.pillText, { color: on ? c.ink : c.ink3, fontFamily: on ? font.semibold : font.medium }]}>{DAY_LETTERS[d]}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.times}>
            <Button label={strip.hours.start} accessibilityLabel={`${HOURS_WORDS.start}, ${strip.hours.start}`} onPress={() => setOpen("start")} style={styles.time} />
            <Text style={[styles.dash, { color: c.ink3 }]}>–</Text>
            <Button label={strip.hours.end} accessibilityLabel={`${HOURS_WORDS.end}, ${strip.hours.end}`} onPress={() => setOpen("end")} style={styles.time} />
          </View>
        </View>
      )}

      {(error ?? failure) ? <StepLine text={(error ?? failure) as string} tone="error" /> : null}
      {!error && note ? <StepLine text={note} /> : null}

      <View style={styles.zone}>
        <Text style={[styles.zoneText, { color: c.ink2 }]}>
          {HOURS_WORDS.zoneLead} <Text style={[styles.zoneName, { color: c.ink }]}>{zone}</Text>.
        </Text>
        <Button variant="quiet" label={HOURS_WORDS.changeZone} accessibilityLabel={`${HOURS_WORDS.changeZone} ${HOURS_WORDS.zone.toLowerCase()}`} onPress={() => setOpen("zone")} style={styles.change} />
      </View>

      <TimeSheet open={open === "start"} title={HOURS_WORDS.start} value={strip.hours.start} onSet={(v) => setHour("start", v)} onClose={close} />
      <TimeSheet open={open === "end"} title={HOURS_WORDS.end} value={strip.hours.end} onSet={(v) => setHour("end", v)} onClose={close} />
      <ZoneSheet open={open === "zone"} title={HOURS_WORDS.zone} current={zone} onPick={setZone} onClose={close} />
    </WelcomeFrame>
  );
}

const styles = StyleSheet.create({
  // The frame already keeps 20 points at each side.
  card: { marginHorizontal: 0 },
  strip: { gap: 12 },
  pills: { flexDirection: "row", gap: 4 },
  pill: { flex: 1, minHeight: TARGET, borderWidth: 1.4, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 16 },
  times: { flexDirection: "row", alignItems: "center", gap: 8 },
  time: { flex: 1 },
  dash: { fontFamily: font.regular, fontSize: 17 },
  zone: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4 },
  zoneText: { flexShrink: 1, fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  zoneName: { fontFamily: font.medium },
  change: { marginLeft: -4 },
});
