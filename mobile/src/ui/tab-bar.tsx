// The phone's tab bar (DESIGN_SYSTEM.md §4a): Today, Inbox, Week, Browse, 56 points over the phone's own bottom
// inset. The app is drawn edge to edge, so the bar's surface runs under the gesture strip: the strip takes the look's
// colour at once, which the installed web app could not do (DECISIONS.md, 2026-11-21).
import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { countLabel } from "@/features/shell/nav";
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

/** `inboxCount` is how many tasks wait in the Inbox; its tab carries the number above zero, as the web's does. */
export function TabBar({ inboxCount }: { inboxCount?: number } = {}) {
  const c = useColours();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { backgroundColor: c.surface, borderTopColor: c.line, paddingBottom: insets.bottom }]}>
      {TABS.map((tab) => {
        const on = tab.path === "/" ? pathname === "/" : pathname.startsWith(tab.path);
        const badge = tab.path === "/inbox" ? countLabel(inboxCount) : null;
        return (
          <Pressable
            key={tab.path}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={badge ? `${tab.label}, ${badge} to triage` : tab.label}
            onPress={() => !on && router.replace(tab.path)}
            style={styles.tab}
          >
            <View>
              <Icon name={tab.icon} size={24} color={on ? c.ink : c.ink3} strokeWidth={on ? 1.9 : 1.6} />
              {badge && (
                <View style={[styles.badge, { backgroundColor: c.ink }]}>
                  <Text style={[styles.badgeText, { color: c.paper }]}>{badge}</Text>
                </View>
              )}
            </View>
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
  badge: { position: "absolute", top: -5, left: 14, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: font.semibold, fontSize: 10, lineHeight: 13, fontVariant: ["tabular-nums"] },
});
