// Settings › About on the phone (SCREENS.md §18; the web's sections/about-section.tsx): the version, how your data
// is kept (the web app's privacy page, opened in the browser), and What's new, the web's own changelog
// (features/settings/changelog.ts). The web's keyboard-shortcuts row is for a keyboard and is not here.
// Presentational.
import { StyleSheet, Text, View } from "react-native";
import { CHANGELOG, changelogDate } from "@/features/settings/changelog";
import { PRIVACY_HINT } from "@/features/settings/section-words";
import { CardRow } from "~/ui/card";
import { font, useColours } from "~/ui/theme";
import { Group, SettingRow } from "./parts";

export interface AboutViewProps {
  version: string | null;
  onPrivacy: () => void;
}

export function AboutView({ version, onPrivacy }: AboutViewProps) {
  const c = useColours();
  return (
    <>
      <Group>
        <CardRow first>
          <SettingRow label="Version" value={version ?? "—"} />
        </CardRow>
        <CardRow>
          <SettingRow label="Privacy" hint={PRIVACY_HINT} onPress={onPrivacy} />
        </CardRow>
      </Group>
      <Group title="What’s new">
        {CHANGELOG.map((entry, i) => (
          <CardRow key={entry.date} first={i === 0}>
            <View style={styles.entry}>
              <Text accessibilityRole="header" style={[styles.date, { color: c.ink2 }]}>
                {changelogDate(entry.date)}
              </Text>
              {entry.items.map((item) => (
                <View key={item} style={styles.item}>
                  <Text aria-hidden style={[styles.text, { color: c.ink3 }]}>
                    •
                  </Text>
                  <Text style={[styles.text, styles.itemText, { color: c.ink }]}>{item}</Text>
                </View>
              ))}
            </View>
          </CardRow>
        ))}
      </Group>
    </>
  );
}

const styles = StyleSheet.create({
  entry: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  date: { fontFamily: font.medium, fontSize: 14, fontVariant: ["tabular-nums"] },
  item: { flexDirection: "row", gap: 8 },
  text: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  itemText: { flex: 1 },
});
