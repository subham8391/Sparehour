// The first run's frame on the phone (ONBOARDING.md "Phone: one step per screen"; SCREENS.md §23 "As built, the M1
// first run"; the web's is features/welcome/welcome-frame.tsx): full screen on paper, with no tab bar and no add
// button; one decision per screen: the question, its one sentence, the step, and the buttons held at the bottom edge
// above the phone's own inset, full width, the primary last where the thumb is. The step scrolls under the buttons;
// with the keyboard up the buttons ride above it.
import type { ReactNode, RefObject } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, useColours } from "~/ui/theme";

export function WelcomeFrame({ title, lead, children, footer, scrollRef }: { title: string; lead: string; children: ReactNode; footer: ReactNode; /** For a step that grows and keeps its last part in view (the brain dump). */ scrollRef?: RefObject<ScrollViewInstance | null> }) {
  const c = useColours();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={[styles.fill, { backgroundColor: c.paper }]}>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" style={styles.fill} contentContainerStyle={[styles.body, { paddingTop: insets.top + 40 }]}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
            {title}
          </Text>
          <Text style={[styles.lead, { color: c.ink2 }]}>{lead}</Text>
        </View>
        <View style={styles.step}>{children}</View>
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: c.paper, borderTopColor: c.line, paddingBottom: Math.max(12, insets.bottom) }]}>{footer}</View>
    </KeyboardAvoidingView>
  );
}

/** A step that is still opening: paper and one quiet line, where the question will be. */
export function WelcomeOpening({ line }: { line: string }) {
  const c = useColours();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fill, styles.body, { backgroundColor: c.paper, paddingTop: insets.top + 40 }]}>
      <Text accessibilityLiveRegion="polite" style={[styles.opening, { color: c.ink3 }]}>
        {line}
      </Text>
    </View>
  );
}

/** A line under a step: what stops it (`tone="error"`, read out at once), or a quiet note. */
export function StepLine({ text, tone = "quiet" }: { text: string; tone?: "quiet" | "ink" | "error" }) {
  const c = useColours();
  return (
    <Text accessibilityRole={tone === "error" ? "alert" : undefined} accessibilityLiveRegion="polite" style={[styles.line, { color: tone === "error" ? c.deadline : tone === "ink" ? c.ink : c.ink2 }]}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingHorizontal: 20, paddingBottom: 24, gap: 24 },
  head: { gap: 8 },
  title: { fontFamily: font.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.4 },
  lead: { fontFamily: font.regular, fontSize: 18, lineHeight: 26 },
  step: { gap: 16 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 12, gap: 8 },
  opening: { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  line: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
});
