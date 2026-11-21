// The name of something new, typed where it will stand (a heading in a project, a project in an area; the web types
// these in place too): the field opens with the cursor in it, and Done on the keyboard, or leaving the field, hands
// the name over once. An empty name is handed over too, so the caller can close the field and make nothing.
import { useRef, useState } from "react";
import type { StyleProp, TextStyle } from "react-native";
import { TextField } from "./text-field";

export function NameField({ label, onDone, style }: { /** What is being named: "Project name". It is the placeholder too. */ label: string; /** The name as typed, once. */ onDone: (name: string) => void; style?: StyleProp<TextStyle> }) {
  const [name, setName] = useState("");
  // Done and the blur that follows it are one answer, not two.
  const sent = useRef(false);
  const send = () => {
    if (sent.current) return;
    sent.current = true;
    onDone(name);
  };
  return <TextField accessibilityLabel={label} placeholder={label} autoFocus value={name} onChangeText={setName} returnKeyType="done" onSubmitEditing={send} onBlur={send} style={style} />;
}
