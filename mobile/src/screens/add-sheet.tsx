// Add a task, from the + button (ANDROID_APP_SPEC.md §10): one line, read by the web app's own quick-add parser, so
// "Call bank 3pm ~30m" means here what it means there.
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { Button } from "~/ui/button";
import { Sheet } from "~/ui/sheet";
import { TextField } from "~/ui/text-field";
import { font, useColours } from "~/ui/theme";

export function AddSheet({ open, onAdd, onClose, hint = "A time, a day and ~30m are understood, as on the web." }: { open: boolean; /** False when the line could not be read as a task. */ onAdd: (line: string) => boolean; onClose: () => void; hint?: string }) {
  const c = useColours();
  const [line, setLine] = useState("");
  const [missed, setMissed] = useState(false);
  const close = () => {
    setLine("");
    setMissed(false);
    onClose();
  };
  const submit = () => {
    if (!line.trim()) return;
    if (onAdd(line)) close();
    else setMissed(true);
  };
  return (
    <Sheet
      open={open}
      title="Add a task"
      onClose={close}
      footer={
        <>
          <Button variant="quiet" label="Cancel" onPress={close} />
          <Button variant="primary" label="Add" disabled={!line.trim()} onPress={submit} />
        </>
      }
    >
      <TextField
        accessibilityLabel="Task"
        autoFocus
        value={line}
        onChangeText={(t) => {
          setLine(t);
          setMissed(false);
        }}
        placeholder="Call the bank 3pm ~30m"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Text style={[styles.hint, { color: missed ? c.deadline : c.ink3 }]}>{missed ? "That line has no words for a title." : hint}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
});
