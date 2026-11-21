// A text field (DESIGN_SYSTEM.md §5): 52 points high on a phone, the control line around it, the app's face.
import { StyleSheet, type TextInputProps } from "react-native";
import { TextInput } from "./text";
import { font, useColours } from "./theme";

export function TextField(props: TextInputProps & { accessibilityLabel: string }) {
  const c = useColours();
  return <TextInput placeholderTextColor={c.ink4} {...props} style={[styles.field, { color: c.ink, borderColor: c.lineControl, backgroundColor: c.surface2 }, props.style]} />;
}

const styles = StyleSheet.create({
  field: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 17 },
});
