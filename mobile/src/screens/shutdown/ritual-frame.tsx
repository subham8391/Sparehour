// The frame of a ritual on the phone (SCREENS.md §§14–15 "Responsive"; DESIGN_SYSTEM.md §4a; the web's is
// features/rituals/ritual-frame.tsx): the screen's own header (ui/screen.tsx) with the eyebrow, the title and Skip at
// the far edge, a strip of numbered steps under it (each a 44-point target, named "Step n: title"), the step's body
// scrolling with them, and a footer that holds the bottom edge above the phone's own inset: Back, which is simply
// not there on the first step, and the step's one action filling the rest. The footer rides above the keyboard while
// a step's field is being typed in. Drawn to the measures of the morning plan's frame (screens/plan/plan-frame.tsx),
// so the two rituals read as one.
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DayPart } from "@/features/looks/look";
import { Button } from "~/ui/button";
import { Icon } from "~/ui/icon";
import { IconButton, Screen } from "~/ui/screen";
import { TARGET, font, useColours } from "~/ui/theme";

export interface RitualSteps {
  /** The step titles, in order; each becomes a "Step n: title" button. */
  labels: readonly string[];
  index: number;
  onStep: (index: number) => void;
}

export function RitualFrame({ eyebrow, title, steps, part, onSkip, footer, children }: { eyebrow: string; title: string; steps: RitualSteps; /** The hour's sky. */ part?: DayPart; onSkip: () => void; footer: ReactNode; children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.fill}>
      <View style={styles.fill}>
        <Screen eyebrow={eyebrow} title={title} part={part} actions={<IconButton icon="close" label="Skip" onPress={onSkip} />}>
          <StepStrip {...steps} />
          <View style={styles.body}>{children}</View>
        </Screen>
      </View>
      {footer}
    </KeyboardAvoidingView>
  );
}

/** Quiet numbered labels: the current one in ink, the ones behind it sunken, the ones ahead outlined. */
function StepStrip({ labels, index, onStep }: RitualSteps) {
  const c = useColours();
  return (
    <View accessibilityLabel="Steps" style={styles.strip}>
      {labels.map((label, i) => {
        const current = i === index;
        const behind = i < index;
        return (
          <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Step ${i + 1}: ${label}`} accessibilityState={{ selected: current }} onPress={() => onStep(i)} style={styles.step}>
            <View style={[styles.stepMark, current ? { backgroundColor: c.ink } : behind ? { backgroundColor: c.surface2 } : { borderWidth: 1, borderColor: c.lineStrong }]}>
              <Text style={[styles.stepText, { color: current ? c.paper : behind ? c.ink2 : c.ink3 }]}>{i + 1}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The footer: Back from the second step on, and the step's one action. */
export function RitualFooter({ onBack, canGoBack, primary }: { onBack: () => void; canGoBack: boolean; primary: { label: string; onPress: () => void } }) {
  const c = useColours();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.paper, paddingBottom: Math.max(12, insets.bottom) }]}>
      {canGoBack ? <Button label="Back" onPress={onBack} icon={<Icon name="arrow-left" size={16} color={c.ink} />} style={styles.back} /> : null}
      {/* The primary fills whatever Back leaves. */}
      <Button variant="primary" label={primary.label} onPress={primary.onPress} style={styles.primary} />
    </View>
  );
}

/** A step's sentence: the fact line, in the voice of the empty states. */
export function Lead({ children }: { children: string }) {
  const c = useColours();
  return <Text style={[styles.lead, { color: c.ink }]}>{children}</Text>;
}

/** A quiet line under a step's content. */
export function Note({ children }: { children: string }) {
  const c = useColours();
  return <Text style={[styles.note, { color: c.ink3 }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  strip: { flexDirection: "row", alignItems: "center", marginHorizontal: 10, marginTop: -8, marginBottom: 8 },
  step: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  stepMark: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepText: { fontFamily: font.semibold, fontSize: 13, fontVariant: ["tabular-nums"] },
  body: { gap: 16, paddingTop: 4 },
  footer: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  back: { paddingHorizontal: 14 },
  primary: { flex: 1 },
  lead: { fontFamily: font.displayMedium, fontSize: 22, lineHeight: 29, paddingHorizontal: 20 },
  note: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, paddingHorizontal: 20 },
});
