// "Add at 14:30" (DECISIONS.md, amendment 2026-11-21; SCREENS.md §2.6; the web's is features/today/add-at-sheet.tsx):
// what a tap on an empty time leads to. It asks first: one of the day's tasks or a name of your own, and how long.
// Nothing is written until Add. The lengths and where the block ends are the web's own (features/today/add-at.ts).
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { formatMinutes } from "@/core/time";
import type { AddWhat, AddableTask } from "@/features/blocking/use-placing";
import { OWN_MIN, addAtEnd, addAtLengths } from "@/features/today/add-at";
import { hhmm } from "@/features/today/timeline-geometry";
import { Button } from "~/ui/button";
import { MenuHeading, MenuRow } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";
import { TextField } from "~/ui/text-field";
import { font, useColours } from "~/ui/theme";

export interface AddAtSheetProps {
  /** Where the block starts, in minutes of the day; null while the sheet is shut. */
  at: number | null;
  /** The day's tasks, in the order to list them; none, and the sheet asks only for a name. */
  tasks: readonly AddableTask[];
  onAdd: (what: AddWhat, startMin: number, endMin: number) => void;
  onClose: () => void;
}

export function AddAtSheet({ at, tasks, onAdd, onClose }: AddAtSheetProps) {
  // Keyed by the minute: opened for another time, it starts again with nothing picked.
  return at === null ? null : <Body key={at} at={at} tasks={tasks} onAdd={onAdd} onClose={onClose} />;
}

function Body({ at, tasks, onAdd, onClose }: AddAtSheetProps & { at: number }) {
  const c = useColours();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(OWN_MIN);
  // A block ends on the day it starts: late in the evening a long one stops at midnight.
  const end = addAtEnd(at, minutes);
  const ready = taskId !== null || name.trim() !== "";
  const add = () => {
    if (!ready) return;
    onClose();
    onAdd(taskId ? { taskId } : { title: name.trim() }, at, end);
  };
  return (
    <Sheet
      open
      title={`Add at ${hhmm(at)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" label="Cancel" onPress={onClose} />
          <Button variant="primary" label="Add" disabled={!ready} onPress={add} />
        </>
      }
    >
      <Text accessibilityLiveRegion="polite" style={[styles.range, { color: c.ink3 }]}>
        {hhmm(at)}–{hhmm(end)} · {formatMinutes(end - at)}
      </Text>
      {tasks.length > 0 && (
        <View accessibilityRole="radiogroup" accessibilityLabel="A task">
          <MenuHeading label="A task" />
          {tasks.map((t) => (
            <MenuRow
              key={t.id}
              label={t.title}
              accessibilityLabel={`${t.title}, ${formatMinutes(t.minutes)}${t.blocked ? ", has a block" : ""}`}
              hint={`${t.blocked ? "has a block · " : ""}${formatMinutes(t.minutes)}`}
              current={taskId === t.id}
              onPress={() => {
                setTaskId(t.id);
                setName("");
                setMinutes(t.minutes);
              }}
            />
          ))}
        </View>
      )}
      <MenuHeading label={tasks.length > 0 ? "Or a block of your own" : "Name"} />
      <TextField
        accessibilityLabel="Name"
        placeholder="Lunch, deep work, a call"
        value={name}
        autoCorrect={false}
        maxLength={120}
        returnKeyType="done"
        onChangeText={(text) => {
          setName(text);
          // One thing at a time: a name typed lets go of the task picked.
          if (text.trim()) setTaskId(null);
        }}
        onSubmitEditing={add}
      />
      <MenuHeading label="How long" />
      <View accessibilityRole="radiogroup" accessibilityLabel="How long" style={styles.lengths}>
        {addAtLengths(minutes).map((m) => (
          <Button key={m} label={formatMinutes(m)} accessibilityLabel={`${formatMinutes(m)}${m === minutes ? ", chosen" : ""}`} variant={m === minutes ? "primary" : "secondary"} onPress={() => setMinutes(m)} style={styles.length} />
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  range: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, marginTop: -6, fontVariant: ["tabular-nums"] },
  lengths: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  length: { minHeight: 44, paddingHorizontal: 14 },
});
