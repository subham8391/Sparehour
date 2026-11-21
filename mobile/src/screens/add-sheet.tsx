// Add a task, from the + button (ANDROID_APP_SPEC.md §10, step 2): one line, read by the web app's own quick-add
// parser, so "Call bank 3pm ~30m" means here what it means there. The full quick add (the strip of what was
// understood, projects, tags) is step 4.
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TARGET, font, useColours } from "~/ui/theme";

export function AddSheet({ open, onAdd, onClose }: { open: boolean; onAdd: (line: string) => boolean; onClose: () => void }) {
  const c = useColours();
  const insets = useSafeAreaInsets();
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
    <Modal visible={open} transparent animationType="slide" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.frame}>
        <Pressable accessibilityLabel="Close" onPress={close} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.line, paddingBottom: insets.bottom + 12 }]}>
          <View style={[styles.grabber, { backgroundColor: c.lineStrong }]} />
          <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
            Add a task
          </Text>
          <TextInput
            accessibilityLabel="Task"
            autoFocus
            value={line}
            onChangeText={(t) => {
              setLine(t);
              setMissed(false);
            }}
            placeholder="Call the bank 3pm ~30m"
            placeholderTextColor={c.ink4}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={[styles.field, { color: c.ink, borderColor: c.lineControl, backgroundColor: c.surface2 }]}
          />
          <Text style={[styles.hint, { color: missed ? c.deadline : c.ink3 }]}>{missed ? "That line has no words for a title." : "A time, a day and ~30m are understood, as on the web."}</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={close} style={styles.quiet}>
              <Text style={[styles.quietText, { color: c.ink2 }]}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !line.trim() }} onPress={submit} style={[styles.primary, { backgroundColor: c.ink, opacity: line.trim() ? 1 : 0.5 }]}>
              <Text style={[styles.primaryText, { color: c.paper }]}>Add</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 20, paddingTop: 8, gap: 10 },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 6 },
  title: { fontFamily: font.semibold, fontSize: 20 },
  field: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontFamily: font.medium, fontSize: 17 },
  hint: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 4 },
  quiet: { minHeight: TARGET, paddingHorizontal: 14, justifyContent: "center" },
  quietText: { fontFamily: font.medium, fontSize: 17 },
  primary: { minHeight: 48, paddingHorizontal: 22, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: font.semibold, fontSize: 17 },
});
