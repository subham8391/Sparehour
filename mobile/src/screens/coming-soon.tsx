// A tab whose screen is not built for the phone yet (ANDROID_APP_SPEC.md §10): it says so plainly rather than show
// an empty list. The data is all there; the web app has the screen meanwhile.
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, sky, useColours, useScheme } from "~/ui/theme";

export function ComingSoon({ title, children }: { title: string; children?: ReactNode }) {
  const c = useColours();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.fill}>
      <LinearGradient colors={sky(scheme, "afternoon")} style={StyleSheet.absoluteFill} />
      <View style={[styles.body, { paddingTop: insets.top + 24 }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
          {title}
        </Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
          <Text style={[styles.line, { color: c.ink }]}>Not in the app yet.</Text>
          <Text style={[styles.note, { color: c.ink3 }]}>Your {title.toLowerCase()} is safe in your account. Open Sparehour on the web to use it for now.</Text>
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 16 },
  title: { fontFamily: font.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.4, paddingHorizontal: 4 },
  card: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 20, gap: 6 },
  line: { fontFamily: font.medium, fontSize: 20, lineHeight: 26 },
  note: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
});
