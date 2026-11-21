// A note on the phone as the web's NoteField draws it (src/ui/note-field.tsx; PRODUCT_SPEC.md §6 "Notes"): read as
// Markdown, edited as the plain text it is stored as. A tap on the note (anywhere but a link) opens the editor; leaving
// it saves and draws the note again. An empty note is the editor straight away, with its placeholder.
import { useState } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle } from "react-native";
import { TextInput } from "./text";
import { Markdown } from "./markdown";
import { useColours } from "./theme";

/** The draft the screen keeps (screens/task/use-draft.ts): what is typed, and when the box is entered and left. */
export interface NoteDraft {
  draft: string;
  setDraft: (text: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

export function NoteBox({ label, placeholder, note, style }: { label: string; placeholder: string; note: NoteDraft; style?: StyleProp<TextStyle> }) {
  const c = useColours();
  const [editing, setEditing] = useState(false);
  const hasWords = note.draft.trim() !== "";
  if (hasWords && !editing)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Edit the note" onPress={() => setEditing(true)} style={styles.read}>
        <View pointerEvents="box-none">
          <Markdown source={note.draft} />
        </View>
      </Pressable>
    );
  return (
    <TextInput
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColor={c.ink4}
      value={note.draft}
      onChangeText={note.setDraft}
      onFocus={note.onFocus}
      onBlur={() => {
        note.onBlur();
        setEditing(false);
      }}
      autoFocus={editing}
      multiline
      textAlignVertical="top"
      style={[style, { color: c.ink }]}
    />
  );
}

const styles = StyleSheet.create({
  read: { minHeight: 44, paddingVertical: 8 },
});
