// A screen's frame whose body keeps one part in sight (SCREENS.md §2.8, §14 "Responsive", §22): the sky, the header
// that Screen draws (the eyebrow, the title, what sits at the far edge), then a part that stays under the top edge
// while everything after it passes beneath, on paper. Today's hero card with the List | Day control is one; the
// morning plan's capacity summary is another. Screen (screen.tsx) cannot pin a part of its body, so this stands
// beside it: the same header, drawn the same way, for a tab or a ritual (neither has Back).
import { LinearGradient } from "expo-linear-gradient";
import { useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DayPart } from "@/features/looks/look";
import { TARGET, font, sky, useColours, useScheme, useWords } from "./theme";

export interface StickyScreenProps {
  title: string;
  /** Small capitals over the title: "Today · Evening". */
  eyebrow?: string;
  /** Icon buttons at the far edge of the header row (IconButton, from screen.tsx). */
  actions?: ReactNode;
  /** The hour's sky; an ordinary afternoon when the screen has no clock of its own. */
  part?: DayPart;
  /** Room left at the bottom for whatever floats over the body (the add button). */
  bottomRoom?: number;
  /** Between the header and the part that stays: it scrolls away with the header. */
  before?: ReactNode;
  /** What stays under the top edge while the rest scrolls. */
  sticky: ReactNode;
  children: ReactNode;
}

export function StickyScreen({ title, eyebrow, actions, part = "afternoon", bottomRoom = 0, before, sticky, children }: StickyScreenProps) {
  const c = useColours();
  // A look that sets its titles in capitals or with wider spacing does so here too (the web's h1 rule).
  const titleWords = useWords("title", 30);
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  // Where the part that stays begins, and whether the body has been scrolled that far: only then is it on paper,
  // so at rest it sits on the sky like everything else.
  const [top, setTop] = useState(0);
  const [stuck, setStuck] = useState(false);
  return (
    <View style={styles.fill}>
      <LinearGradient colors={sky(scheme, part)} style={StyleSheet.absoluteFill} />
      {/* The body ends under the status bar, so what stays rests clear of it. */}
      <View style={[styles.fill, { paddingTop: insets.top }]}>
        <ScrollView
          testID="sticky-scroll"
          keyboardShouldPersistTaps="handled"
          stickyHeaderIndices={[1]}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const now = top > 0 && e.nativeEvent.contentOffset.y >= top;
            if (now !== stuck) setStuck(now);
          }}
          contentContainerStyle={{ paddingBottom: bottomRoom + 24 }}
        >
          <View testID="sticky-before" onLayout={(e) => setTop(e.nativeEvent.layout.height)}>
            <View style={styles.head}>
              <View style={styles.headRow}>
                <Text style={[styles.eyebrow, { color: c.ink3 }]}>{(eyebrow ?? "").toUpperCase()}</Text>
                <View style={styles.actions}>{actions}</View>
              </View>
              <Text accessibilityRole="header" style={[styles.title, { color: c.ink }, titleWords]}>
                {title}
              </Text>
            </View>
            {before}
          </View>
          <View testID="sticky-part" style={[styles.sticky, stuck && { backgroundColor: c.paper, borderBottomColor: c.line }]}>
            {sticky}
          </View>
          <View>{children}</View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // As Screen's header (screen.tsx).
  head: { paddingTop: 12, paddingHorizontal: 20, paddingBottom: 16 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: TARGET },
  eyebrow: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3 },
  actions: { flexDirection: "row", alignItems: "center", marginRight: -10 },
  title: { fontFamily: font.display, fontSize: 30, lineHeight: 36, maxWidth: 320 },
  sticky: { paddingTop: 8, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "transparent" },
});
