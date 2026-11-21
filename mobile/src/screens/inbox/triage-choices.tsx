// What triage's pickers offer on the phone (SCREENS.md §5; the web's are features/inbox/triage-sheet.tsx with the
// detail's pickers): the projects to file into, the estimate presets with a length typed in, and a day typed in words,
// taken from the day chips or picked from the month (the web's date field). Each is a sheet's body, so the Inbox's row sheet and the Triage all walk draw the same
// ones. Presentational, and nothing is decided here: the project rows and their order (move-options.ts), the presets
// (estimate-presets.ts), the typed length (core/time/parse-length.ts), the typed day (core/quickadd/read-date.ts) and
// the day chips (date-choices.ts over the snooze presets) are the web app's own.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { readTypedDate } from "@/core/quickadd/read-date";
import { formatMinutes, type Instant, type LocalDate } from "@/core/time";
import { parseLength } from "@/core/time/parse-length";
import { dayLabel } from "@/features/quickadd/day-label";
import { dateChoices } from "@/features/tasks/date-choices";
import { ESTIMATE_PRESETS } from "@/features/tasks/estimate-presets";
import { moveOptions, type MoveProject } from "@/features/tasks/move-options";
import { snoozePresets } from "@/features/tasks/snooze";
import { Button } from "~/ui/button";
import { MenuHeading, MenuRow } from "~/ui/menu-row";
import { MonthCalendar } from "~/ui/month-calendar";
import { TextField } from "~/ui/text-field";
import { font, useColours } from "~/ui/theme";

/** The projects a task can be filed into, for the picker: the open ones with their area's name, and the areas in order. */
export interface ProjectChoicesData {
  projects: readonly MoveProject[];
  areaOrder: readonly { id: string; name: string }[];
}

export type PickedProject = { id: string | null; name: string | null };

/** "No project", then the open projects under their areas; the field narrows the list as the web's does. */
export function ProjectChoices({ projects, areaOrder, currentProjectId, onPick }: ProjectChoicesData & { currentProjectId: string | null; onPick: (project: PickedProject) => void }) {
  const c = useColours();
  const [query, setQuery] = useState("");
  const options = moveOptions({ projects, areaOrder, currentProjectId, onPick: (target) => target.kind === "project" && onPick({ id: target.id, name: target.name }) }, query);
  return (
    <>
      <TextField accessibilityLabel="Project" placeholder="Project…" value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" returnKeyType="search" />
      <View>
        {options.length === 0 ? (
          <Text style={[styles.hint, { color: c.ink2 }]}>No project by that name.</Text>
        ) : (
          options.map((o, i) => (
            <View key={o.key}>
              {o.group && o.group !== options[i - 1]?.group ? <MenuHeading label={o.group} /> : null}
              <MenuRow label={o.label} icon={o.icon} current={o.current} onPress={o.pick} />
            </View>
          ))
        )}
      </View>
    </>
  );
}

/** The estimate presets, a length typed in ("45", "1h 30m"), and No estimate for a task that has one. */
export function EstimateChoices({ value, onPick }: { value: number | null; onPick: (minutes: number | null) => void }) {
  const c = useColours();
  const [text, setText] = useState("");
  const [missed, setMissed] = useState(false);
  const read = parseLength(text);
  const commit = () => {
    if (read != null) {
      onPick(read);
      setText("");
    } else if (text.trim()) setMissed(true);
  };
  return (
    <>
      <View style={styles.wrap}>
        {ESTIMATE_PRESETS.map((m) => (
          <Button key={m} label={formatMinutes(m)} accessibilityLabel={value === m ? `${formatMinutes(m)}, the estimate now` : formatMinutes(m)} variant={value === m ? "primary" : "secondary"} onPress={() => onPick(m)} />
        ))}
      </View>
      <View style={styles.typed}>
        <TextField
          accessibilityLabel="Length"
          placeholder="45 or 1h 30m"
          value={text}
          onChangeText={(t) => {
            setText(t);
            setMissed(false);
          }}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={commit}
          style={styles.field}
        />
        <Button label="Set" accessibilityLabel="Set the length" onPress={commit} />
      </View>
      {missed || read != null ? <Text style={[styles.hint, { color: c.ink2 }]}>{missed ? "Type minutes, or hours like 1h 30m. Up to 24h." : `→ ${formatMinutes(read ?? 0)}`}</Text> : null}
      {value != null ? <Button variant="quiet" label="No estimate" onPress={() => onPick(null)} style={styles.clear} /> : null}
    </>
  );
}

/** A day typed in words ("next tue", "21 oct", "in 3 days"), taken from the chips or picked from the month; Clear for a task that has one. */
export function DayChoices({ value, today, now, zone, clear, onPick }: { value: LocalDate | null; today: LocalDate; now: Instant; zone: string; /** The word for taking the day away; left out where a day has to be chosen. */ clear?: string; onPick: (day: LocalDate | null) => void }) {
  const c = useColours();
  const [text, setText] = useState("");
  const [missed, setMissed] = useState(false);
  const read = text.trim() ? readTypedDate(text, { now, zone, today }) : null;
  const commit = () => {
    if (read) {
      onPick(read.date);
      setText("");
    } else if (text.trim()) setMissed(true);
  };
  return (
    <>
      <View style={styles.typed}>
        <TextField
          accessibilityLabel="In words"
          placeholder="next tue · 21 oct · in 3 days"
          value={text}
          onChangeText={(t) => {
            setText(t);
            setMissed(false);
          }}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={commit}
          style={styles.field}
        />
        <Button label="Set" accessibilityLabel="Set the day" onPress={commit} />
      </View>
      {missed || read ? <Text style={[styles.hint, { color: c.ink2 }]}>{missed || !read ? "Didn't catch that" : `→ ${dayLabel(read.date, today)}`}</Text> : null}
      <View style={styles.wrap}>
        {dateChoices(today, snoozePresets(now, zone, today)).map((d) => {
          const on = value?.equals(d.date) ?? false;
          return <Button key={d.label} label={d.label} accessibilityLabel={on ? `${d.label}, the day now` : d.label} variant={on ? "primary" : "secondary"} onPress={() => onPick(d.date)} />;
        })}
      </View>
      <MonthCalendar value={value} today={today} onPick={onPick} />
      {value && clear ? <Button variant="quiet" label={clear} onPress={() => onPick(null)} style={styles.clear} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typed: { flexDirection: "row", alignItems: "center", gap: 8 },
  field: { flex: 1 },
  hint: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  clear: { alignSelf: "flex-start", marginLeft: -12 },
});
