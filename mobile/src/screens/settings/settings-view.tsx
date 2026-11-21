// Settings as the phone draws it (SCREENS.md §18 "Responsive": "the section list is one screen and each section
// pushes in"): the web's header words, then one card of sections, each with the one-line summary the web's phone
// list shows. Presentational: the sections and their summaries are handed in.
import { StyleSheet, Text } from "react-native";
import { Card, CardRow } from "~/ui/card";
import { Screen } from "~/ui/screen";
import { SummaryRow } from "~/ui/summary-row";
import { font, useColours } from "~/ui/theme";
import type { PhoneSectionKey } from "./sections";

export interface SettingsItem {
  key: PhoneSectionKey;
  title: string;
  summary: string;
}

export interface SettingsViewProps {
  /** Null while the settings row is still being read. */
  items: readonly SettingsItem[] | null;
  onOpen: (key: PhoneSectionKey) => void;
}

export function SettingsView({ items, onOpen }: SettingsViewProps) {
  const c = useColours();
  return (
    <Screen title="Your day" eyebrow="Settings" back>
      <Text style={[styles.subtitle, { color: c.ink2 }]}>Every change saves as you make it.</Text>
      {items ? (
        <Card>
          {items.map((item, i) => (
            <CardRow key={item.key} first={i === 0}>
              <SummaryRow label={item.title} summary={item.summary} onPress={() => onOpen(item.key)} />
            </CardRow>
          ))}
        </Card>
      ) : (
        <Text style={[styles.opening, { color: c.ink3 }]}>Opening…</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, marginHorizontal: 20, marginTop: -8, marginBottom: 16 },
  opening: { fontFamily: font.regular, fontSize: 16, marginHorizontal: 22 },
});
