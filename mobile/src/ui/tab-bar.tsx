// The phone's tab bar (DESIGN_SYSTEM.md §4a): Today, Inbox, Week, Browse, 56 points over the phone's own bottom
// inset. The app is drawn edge to edge, so the bar's surface runs under the gesture strip: the strip takes the look's
// colour at once, which the installed web app could not do (DECISIONS.md, 2026-11-21).
import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./icon";
import { font, useColours } from "./theme";

export const TABS: readonly { path: "/" | "/inbox" | "/week" | "/browse"; label: string; icon: IconName }[] = [
  { path: "/", label: "Today", icon: "sun" },
  { path: "/inbox", label: "Inbox", icon: "inbox" },
  { path: "/week", label: "Week", icon: "calendar-week" },
  { path: "/browse", label: "Browse", icon: "grid" },
];

/** The bar's own height, without the phone's inset: what a screen leaves free above it. */
export const TAB_BAR_HEIGHT = 56;

export function TabBar() {
  const c = useColours();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.line, paddingBottom: insets.bottom }]}>
      {TABS.map((tab) => {
        const on = tab.path === "/" ? pathname === "/" : pathname.startsWith(tab.path);
        return (
          <Pressable
            key={tab.path}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            onPress={() => !on && router.replace(tab.path)}
            style={styles.tab}
          >
            <Icon name={tab.icon} size={24} color={on ? c.ink : c.ink3} strokeWidth={on ? 1.9 : 1.6} />
            <Text style={[styles.label, { color: on ? c.ink : c.ink3, fontFamily: on ? font.semibold : font.medium }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, height: TAB_BAR_HEIGHT, alignItems: "center", justifyContent: "center", gap: 3 },
  label: { fontSize: 12 },
});
