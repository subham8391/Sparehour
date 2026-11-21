// A screen's frame (SCREENS.md at phone width): the sky behind everything, then a header with a small eyebrow, the
// title, and up to two things at the far edge; a pushed screen has Back at the near edge. The body scrolls under it.
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View, type RefreshControlProps } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DayPart } from "@/features/looks/look";
import { Icon } from "./icon";
import { TARGET, font, sky, useColours, useScheme, useWords } from "./theme";

export interface ScreenProps {
  title: string;
  /** Small capitals over the title: "Today · Evening". */
  eyebrow?: string;
  /** A pushed screen: Back at the near edge. Left out on a tab. */
  back?: boolean;
  /** Icon buttons at the far edge of the header row (IconButton). */
  actions?: ReactNode;
  /** The hour's sky; an ordinary afternoon when the screen has no clock of its own. */
  part?: DayPart;
  /** Room left at the bottom for whatever floats over the body (the add button). */
  bottomRoom?: number;
  /** A body that scrolls itself (a FlatList) is handed the frame without a ScrollView. */
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  children: ReactNode;
}

export function Screen({ title, eyebrow, back = false, actions, part = "afternoon", bottomRoom = 0, scroll = true, refreshControl, children }: ScreenProps) {
  const c = useColours();
  // A look that sets its titles in capitals or with wider spacing does so here too (the web's h1 rule).
  const titleWords = useWords("title", 30);
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const head = (
    <View style={styles.head}>
      <View style={styles.headRow}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={8} style={[styles.iconButton, styles.back]}>
            <Icon name="arrow-left" size={24} color={c.ink2} strokeWidth={1.8} />
          </Pressable>
        ) : (
          <Text style={[styles.eyebrow, { color: c.ink3 }]}>{(eyebrow ?? "").toUpperCase()}</Text>
        )}
        <View style={styles.actions}>{actions}</View>
      </View>
      {back && eyebrow ? <Text style={[styles.eyebrow, styles.eyebrowUnder, { color: c.ink3 }]}>{eyebrow.toUpperCase()}</Text> : null}
      <Text accessibilityRole="header" style={[styles.title, { color: c.ink }, titleWords]}>
        {title}
      </Text>
    </View>
  );
  return (
    <View style={styles.fill}>
      <LinearGradient colors={sky(scheme, part)} style={StyleSheet.absoluteFill} />
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" refreshControl={refreshControl} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: bottomRoom + 24 }}>
          {head}
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, { paddingTop: insets.top + 12 }]}>
          {head}
          {children}
        </View>
      )}
    </View>
  );
}

/** A 44-point icon button for a header's far edge. */
export function IconButton({ icon, label, onPress }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; onPress: () => void }) {
  const c = useColours();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={styles.iconButton}>
      <Icon name={icon} size={22} color={c.ink2} strokeWidth={icon === "more" ? 2.4 : 1.7} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { paddingHorizontal: 20, paddingBottom: 16 },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: TARGET },
  eyebrow: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3 },
  eyebrowUnder: { marginBottom: 2 },
  actions: { flexDirection: "row", alignItems: "center", marginRight: -10 },
  iconButton: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  back: { marginLeft: -10 },
  title: { fontFamily: font.display, fontSize: 30, lineHeight: 36, maxWidth: 320 },
});
