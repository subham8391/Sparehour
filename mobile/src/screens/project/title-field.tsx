// The name of a project or an area, edited where it stands (the web's inline title): a tap puts the cursor in it,
// Done on the keyboard or leaving the field saves it, and an emptied name goes back to what it was. A name is one
// line of words, however it wraps: a pasted line break becomes a space.
import { StyleSheet, TextInput } from "react-native";
import { useDraft } from "~/screens/task/use-draft";
import { font, useColours } from "~/ui/theme";

export function TitleField({ label, value, onSave }: { /** "Project name", "Area name". */ label: string; value: string; onSave: (name: string) => void }) {
  const c = useColours();
  const name = useDraft(value, (text) => {
    const next = text.trim();
    if (next && next !== value) onSave(next);
    return next || value;
  });
  return (
    <TextInput
      accessibilityLabel={label}
      value={name.draft}
      onChangeText={(t) => name.setDraft(t.replace(/\s*[\r\n]+\s*/g, " "))}
      onFocus={name.onFocus}
      onBlur={name.onBlur}
      multiline
      submitBehavior="blurAndSubmit"
      returnKeyType="done"
      style={[styles.title, { color: c.ink }]}
    />
  );
}

const styles = StyleSheet.create({
  title: { minHeight: 56, paddingTop: 15, paddingBottom: 13, paddingHorizontal: 16, fontFamily: font.semibold, fontSize: 20, lineHeight: 26 },
});
