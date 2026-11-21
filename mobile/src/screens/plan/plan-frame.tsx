// The morning plan's frame on the phone (SCREENS.md §14 "Responsive"; DESIGN_SYSTEM.md §4a; the web's is features/
// rituals/ritual-frame.tsx): the strip of numbered steps under the title, each a 44-point target that goes to its
// step, and the footer that holds the bottom edge above the safe area: Back, which is simply not there on the first
// step so the primary fills the row, and the step's one action, 48 points tall. The eyebrow, the title and Skip are
// the screen's own header (ui/screen.tsx, ui/sticky-screen.tsx).
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "~/ui/button";
import { Icon } from "~/ui/icon";
import { TARGET, font, useColours } from "~/ui/theme";

export interface PlanSteps {
  /** The step titles, in order; each becomes a "Step n: title" button. */
  labels: readonly string[];
  index: number;
  onStep: (index: number) => void;
}

/** Quiet numbered labels: the current one in ink, the ones behind it sunken, the ones ahead outlined. */
export function StepStrip({ labels, index, onStep }: PlanSteps) {
  const c = useColours();
  return (
    <View accessibilityLabel="Steps" style={styles.strip}>
      {labels.map((label, i) => (
        <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Step ${i + 1}: ${label}`} accessibilityState={{ selected: i === index }} onPress={() => onStep(i)} style={styles.step}>
          <View style={[styles.dot, i === index ? { backgroundColor: c.ink } : i < index ? { backgroundColor: c.surface2 } : { borderWidth: 1, borderColor: c.lineStrong }]}>
            <Text style={[styles.number, { color: i === index ? c.paper : i < index ? c.ink2 : c.ink3 }]}>{i + 1}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function PlanFooter({ onBack, canGoBack, primary }: { onBack: () => void; canGoBack: boolean; primary: { label: string; onPress: () => void } }) {
  const c = useColours();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.footer, { backgroundColor: c.paper, borderTopColor: c.line, paddingBottom: Math.max(12, insets.bottom) }]}>
      {canGoBack ? <Button variant="secondary" label="Back" onPress={onBack} icon={<Icon name="arrow-left" size={16} color={c.ink} />} style={styles.back} /> : null}
      {/* The primary fills whatever Back leaves. */}
      <Button variant="primary" label={primary.label} onPress={primary.onPress} style={styles.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", alignItems: "center", marginHorizontal: 10, marginTop: -8, marginBottom: 8 },
  step: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  dot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  number: { fontFamily: font.semibold, fontSize: 13, fontVariant: ["tabular-nums"] },
  footer: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  back: { paddingHorizontal: 14 },
  primary: { flex: 1 },
});
