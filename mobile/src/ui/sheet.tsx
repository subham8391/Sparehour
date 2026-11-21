// The one overlay every dialog shares on the phone (DESIGN_SYSTEM.md §4, §7): a scrim and a bottom sheet with a
// grabber and sheet corners, over the phone's own bottom inset. A tap on the scrim, or Android's back, closes it.
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, useColours } from "./theme";

export function Sheet({ open, title, onClose, children, footer }: { open: boolean; title?: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const c = useColours();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.frame}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} />
        <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.line, paddingBottom: insets.bottom + 12, maxHeight: "88%" }]}>
          <View style={[styles.grabber, { backgroundColor: c.lineStrong }]} />
          {title ? (
            <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
              {title}
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, paddingTop: 8 },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 8 },
  title: { fontFamily: font.semibold, fontSize: 20, paddingHorizontal: 20, marginBottom: 8 },
  body: { paddingHorizontal: 20, paddingBottom: 8, gap: 10 },
  footer: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 8 },
});
