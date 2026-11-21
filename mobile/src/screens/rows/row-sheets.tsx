// The pickers a row's ⋯ and the bulk bar open, as bottom sheets (the web's are features/tasks/day-picker.tsx,
// move-picker.tsx and tag-picker.tsx at phone width). Move to…: the next seven days, each with its spare or over
// readout and the task's own day marked, then a month for any other day. Move to a project: "No project", then the
// open projects under their areas, narrowed by a field. Add a tag: the space's tags, the best match first, and
// "Create tag “x”" for a new name. Presentational: the rows and their order are the web's own (picker-days.ts,
// move-options.ts, tag-options.ts); each says what was picked, and the frame writes.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LocalDate } from "@/core/time";
import { tagOptions } from "@/features/tasks/tag-options";
import type { DayReadout } from "@/features/upcoming/week";
import { ProjectChoices, type PickedProject, type ProjectChoicesData } from "~/screens/inbox/triage-choices";
import { ReadoutText } from "~/screens/week/day-bar";
import { Button } from "~/ui/button";
import { Icon } from "~/ui/icon";
import { MenuRow } from "~/ui/menu-row";
import { MonthCalendar } from "~/ui/month-calendar";
import { Sheet } from "~/ui/sheet";
import { TextField } from "~/ui/text-field";
import { font, useColours } from "~/ui/theme";

/** One of the picker's days: "Today" with "Sat 21" beside it, or "Thu 26" alone, and how full the day is. */
export interface PickerDay {
  day: LocalDate;
  name: string;
  /** The weekday and date, when the name is a word ("Today", "Tomorrow"). */
  date?: string;
  /** "3h spare", "1h over", "Day off"; left out until capacity is worked out. */
  readout?: DayReadout;
}

const cancel = (onClose: () => void) => <Button variant="quiet" label="Cancel" onPress={onClose} />;

export interface DayPickerSheetProps {
  /** The task being moved; null while the sheet is shut. */
  task: { title: string; doDate: LocalDate | null } | null;
  /** "Move to…" */
  label?: string;
  today: LocalDate;
  days: readonly PickerDay[];
  onPick: (day: LocalDate) => void;
  onClose: () => void;
}

export function DayPickerSheet({ task, label = "Move to…", today, days, onPick, onClose }: DayPickerSheetProps) {
  const c = useColours();
  return (
    <Sheet open={task !== null} title={label} onClose={onClose} footer={cancel(onClose)}>
      {task ? (
        <Text numberOfLines={2} style={[styles.sub, { color: c.ink2 }]}>
          For “{task.title}”
        </Text>
      ) : null}
      <View>
        {days.map((d) => {
          const here = task?.doDate?.equals(d.day) ?? false;
          return (
            <Pressable
              key={d.day.toString()}
              accessibilityRole="button"
              accessibilityLabel={`${d.name}${d.date ? `, ${d.date}` : ""}${d.readout ? `, ${d.readout.text}` : ""}`}
              accessibilityState={{ selected: here }}
              onPress={() => onPick(d.day)}
              style={({ pressed }) => [styles.day, pressed && { backgroundColor: c.surface2 }]}
            >
              <Text style={[styles.dayName, { color: c.ink, fontFamily: here ? font.semibold : font.medium }]}>{d.name}</Text>
              {d.date ? <Text style={[styles.dayDate, { color: c.ink3 }]}>{d.date}</Text> : null}
              {here ? <Icon name="check" size={16} color={c.ink2} strokeWidth={2.2} /> : null}
              <View style={styles.fill} />
              {d.readout ? <ReadoutText readout={d.readout} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.pick, { color: c.ink2 }]}>Pick a date</Text>
      {/* Any other day, from today on: the web's date field. */}
      <MonthCalendar value={null} today={today} min={today} onPick={onPick} />
    </Sheet>
  );
}

/** A day for every ticked task (the bulk bar's "Pick a date"). */
export function DateSheet({ open, title, today, onPick, onClose }: { open: boolean; title: string; today: LocalDate; onPick: (day: LocalDate) => void; onClose: () => void }) {
  return (
    <Sheet open={open} title={title} onClose={onClose} footer={cancel(onClose)}>
      <MonthCalendar value={null} today={today} onPick={onPick} />
    </Sheet>
  );
}

export interface MoveSheetProps {
  /** How many tasks move; 0 while the sheet is shut. */
  count: number;
  /** The project the one task already has, marked in the list. */
  currentProjectId: string | null;
  choices: ProjectChoicesData;
  onPick: (project: PickedProject) => void;
  onClose: () => void;
}

export function MoveSheet({ count, currentProjectId, choices, onPick, onClose }: MoveSheetProps) {
  const what = count === 1 ? "this task" : `${count} tasks`;
  return (
    <Sheet open={count > 0} title={`Move ${what} to a project`} onClose={onClose} footer={cancel(onClose)}>
      {count > 0 ? <ProjectChoices {...choices} currentProjectId={currentProjectId} onPick={onPick} /> : null}
    </Sheet>
  );
}

export interface TagSheetProps {
  /** How many tasks are tagged; 0 while the sheet is shut. */
  count: number;
  tags: readonly { id: string; name: string }[];
  /** The tags the one task already has, marked in the list. */
  attached: readonly string[];
  onPick: (name: string) => void;
  onClose: () => void;
}

export function TagSheet(p: TagSheetProps) {
  return (
    <Sheet open={p.count > 0} title={p.count === 1 ? "Add a tag" : `Tag ${p.count} tasks`} onClose={p.onClose} footer={cancel(p.onClose)}>
      {p.count > 0 ? <TagChoices {...p} /> : null}
    </Sheet>
  );
}

function TagChoices({ tags, attached, onPick }: TagSheetProps) {
  const c = useColours();
  const [query, setQuery] = useState("");
  const options = tagOptions({ tags, attached, onPick }, query);
  return (
    <>
      <TextField
        accessibilityLabel="Tag"
        placeholder="Tag…"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="done"
        // Done on the keyboard takes the first row, as Enter does on the web.
        onSubmitEditing={() => options[0]?.pick()}
      />
      <View>
        {options.length === 0 ? <Text style={[styles.sub, styles.empty, { color: c.ink2 }]}>Type a name to make a tag.</Text> : options.map((o) => <MenuRow key={o.key} label={o.label} icon={o.icon} hint={o.hint} current={o.current} onPress={o.pick} />)}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, marginTop: -6 },
  empty: { marginTop: 4 },
  day: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 },
  dayName: { fontSize: 17, fontVariant: ["tabular-nums"] },
  dayDate: { fontFamily: font.regular, fontSize: 14, fontVariant: ["tabular-nums"] },
  fill: { flex: 1 },
  pick: { fontFamily: font.medium, fontSize: 15, marginTop: 4 },
});
