// Settings › Appearance on the phone (SCREENS.md §18; the web's sections/appearance-section.tsx): the look, as a
// grid of small previews drawn from each look's own swatches in the theme on screen; Light / Dark / System; and
// Motion, System or Reduce. Which looks are on show, their names, the choices and the sentences are the web's own
// (features/looks/catalog.ts, look-choices.ts, features/settings/section-words.ts). The look and the theme are the
// account's and follow the person; Motion is this phone's own. Presentational.
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Swatch } from "@/features/looks/catalog";
import { useLookChoices } from "@/features/looks/look-choices";
import { useSavedFlash } from "@/features/settings/saved-flash";
import { LOOK_HINT, MOTIONS, THEMES, motionHint } from "@/features/settings/section-words";
import type { MotionChoice, SettingsValues } from "@/features/settings/settings-values";
import { Button } from "~/ui/button";
import { CardRow } from "~/ui/card";
import { Icon } from "~/ui/icon";
import { Segmented } from "~/ui/segmented";
import { font, useColours, useScheme } from "~/ui/theme";
import { Group, SettingRow } from "./parts";

export interface AppearanceViewProps {
  /** The look's id, as the account keeps it. */
  look: string;
  /** The theme, as the account keeps it. */
  theme: SettingsValues["theme"];
  /** Reduce motion on this phone. */
  motion: MotionChoice;
  onLook: (id: string) => void;
  onTheme: (theme: SettingsValues["theme"]) => void;
  onMotion: (motion: MotionChoice) => void;
}

export function AppearanceView({ look, theme, motion, onLook, onTheme, onMotion }: AppearanceViewProps) {
  const c = useColours();
  const dark = useScheme() === "dark";
  const [saved, flash] = useSavedFlash();
  const { looks, rest, moreLabel, toggle, tried } = useLookChoices(look);
  return (
    <Group saved={saved}>
      <CardRow first>
        <SettingRow label="Look" hint={LOOK_HINT}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Look" style={styles.grid}>
            {looks.map((l) => {
              const on = l.id === look;
              return (
                <Pressable
                  key={l.id}
                  accessibilityRole="radio"
                  accessibilityLabel={l.name}
                  accessibilityHint={l.feel}
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    tried(l.id);
                    if (!on) {
                      onLook(l.id);
                      flash();
                    }
                  }}
                  style={({ pressed }) => [styles.tile, (on || pressed) && { backgroundColor: c.surface2 }]}
                >
                  <View style={[styles.ring, { borderColor: on ? c.ink : "transparent" }]}>
                    <Preview s={dark ? l.dark : l.light} />
                  </View>
                  <View style={styles.name}>
                    <Text style={[styles.nameText, { color: c.ink }]}>{l.name}</Text>
                    {on ? <Icon name="check" size={14} color={c.ink} strokeWidth={2} /> : null}
                  </View>
                  <Text style={[styles.feel, { color: c.ink3 }]}>{l.feel}</Text>
                </Pressable>
              );
            })}
          </View>
          {rest > 0 ? <Button variant="quiet" label={moreLabel} onPress={toggle} style={styles.more} /> : null}
        </SettingRow>
      </CardRow>
      <CardRow>
        <SettingRow label="Theme">
          <Segmented
            label="Theme"
            options={THEMES}
            value={theme}
            onChange={(t) => {
              onTheme(t);
              flash();
            }}
          />
        </SettingRow>
      </CardRow>
      <CardRow>
        <SettingRow label="Motion" hint={motionHint(motion)}>
          <Segmented
            label="Motion"
            options={MOTIONS}
            value={motion}
            onChange={(m) => {
              onMotion(m);
              flash();
            }}
          />
        </SettingRow>
      </CardRow>
    </Group>
  );
}

/** A look in small: its page, a card on it, a spare-time figure and the bar under it, in the look's own colours (data, not tokens). */
function Preview({ s }: { s: Swatch }) {
  return (
    <View aria-hidden style={[styles.preview, { backgroundColor: s.page }]}>
      <View style={[styles.previewCard, { backgroundColor: s.card, borderColor: `${s.ink}1f` }]}>
        <Text style={[styles.previewFigure, { color: s.ink }]}>7h 10m</Text>
        <View style={[styles.previewTrack, { backgroundColor: `${s.ink}26` }]}>
          <View style={[styles.previewFill, { backgroundColor: s.spare }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 },
  tile: { width: "50%", padding: 6, borderRadius: 14, gap: 4 },
  ring: { borderWidth: 2, borderRadius: 12, padding: 2 },
  preview: { aspectRatio: 4 / 3, borderRadius: 8, padding: 8, justifyContent: "flex-end", overflow: "hidden" },
  previewCard: { borderRadius: 6, borderWidth: 1, padding: 8, gap: 6 },
  previewFigure: { fontFamily: font.bold, fontSize: 14, lineHeight: 16, fontVariant: ["tabular-nums"] },
  previewTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  previewFill: { height: 6, width: "67%", marginLeft: "33%", borderRadius: 3 },
  name: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 },
  nameText: { fontFamily: font.medium, fontSize: 15 },
  feel: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, paddingHorizontal: 2 },
  more: { alignSelf: "flex-start", marginLeft: -12 },
});
