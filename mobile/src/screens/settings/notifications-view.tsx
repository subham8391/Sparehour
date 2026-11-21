// Settings › Notifications on the phone (SCREENS.md §18, PRODUCT_SPEC.md §14; the web's
// sections/notifications-section.tsx): the account's reminder settings, which every device shares: the category
// switches, how early a block reminder comes, when the morning and shutdown nudges come (from working hours unless
// a time is chosen), quiet hours, which drop what falls inside them, and the badge. The web's first row, this
// device's own permission, is not here: reminders on the phone need Android's push service, which is not built yet
// (ANDROID_APP_SPEC.md §6). The choices and the sentences are the web's own (notify-rules.ts, section-words.ts).
// Presentational.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { SettingsPatch } from "@/data/repositories/settings-repo";
import { BLOCK_LEADS, leadLabel, nudgeHint, suggestedNudgeTime } from "@/features/settings/notify-rules";
import { useSavedFlash } from "@/features/settings/saved-flash";
import { BADGE_HINT, NEVER_LATE, QUIET_HOURS_HINT } from "@/features/settings/section-words";
import type { Segment } from "@/features/settings/settings-rules";
import type { SettingsValues } from "@/features/settings/settings-values";
import { Button } from "~/ui/button";
import { CardRow } from "~/ui/card";
import { SwitchRow } from "~/ui/switch-row";
import { font, useColours } from "~/ui/theme";
import { ChoiceSheet, Group, SettingRow, TimeSheet } from "./parts";

export interface NotificationsViewProps {
  values: SettingsValues;
  /** The working week, for the time "Choose a time" starts from. */
  workHours: readonly (readonly Segment[])[];
  onChange: (patch: SettingsPatch) => void;
}

type TimeKey = "morningNudgeTime" | "shutdownNudgeTime" | "quietHoursStart" | "quietHoursEnd";
const TIME_TITLES: Record<TimeKey, string> = {
  morningNudgeTime: "Morning nudge time",
  shutdownNudgeTime: "Shutdown nudge time",
  quietHoursStart: "Quiet hours start",
  quietHoursEnd: "Quiet hours end",
};

export function NotificationsView({ values, workHours, onChange }: NotificationsViewProps) {
  const c = useColours();
  const [saved, flash] = useSavedFlash();
  const [time, setTime] = useState<TimeKey | null>(null);
  const [leading, setLeading] = useState(false);
  const change = (patch: SettingsPatch) => {
    onChange(patch);
    flash();
  };
  const nudge = (kind: "morning" | "shutdown", label: string, on: boolean, key: "morningNudgeTime" | "shutdownNudgeTime", toggle: (v: boolean) => void) => (
    <CardRow>
      <SwitchRow label={label} hint={nudgeHint(kind, values[key])} checked={on} onChange={toggle} />
      {on ? (
        <View style={styles.under}>
          {values[key] ? (
            <>
              <Button label={values[key]} accessibilityLabel={`${TIME_TITLES[key]}, ${values[key]}`} onPress={() => setTime(key)} />
              <Button variant="quiet" label="Use my working hours" onPress={() => change({ [key]: null })} />
            </>
          ) : (
            <Button variant="quiet" label="Choose a time" accessibilityLabel={`${label}, choose a time`} onPress={() => change({ [key]: suggestedNudgeTime(kind, workHours) })} style={styles.quietFirst} />
          )}
        </View>
      ) : null}
    </CardRow>
  );
  return (
    <>
      <Group saved={saved} note={NEVER_LATE}>
        <CardRow first>
          <SwitchRow label="A time block is starting" checked={values.notifyBlockStart} onChange={(v) => change({ notifyBlockStart: v })} />
        </CardRow>
        <CardRow>
          <SettingRow label="Remind me" value={leadLabel(values.blockStartLeadMin)} disabled={!values.notifyBlockStart} onPress={() => setLeading(true)} />
        </CardRow>
        <CardRow>
          <SwitchRow label="A deadline, the day before and the day of" checked={values.notifyDeadline} onChange={(v) => change({ notifyDeadline: v })} />
        </CardRow>
        {nudge("morning", "Morning nudge", values.notifyMorning, "morningNudgeTime", (v) => change({ notifyMorning: v }))}
        {nudge("shutdown", "Evening shutdown nudge", values.notifyShutdown, "shutdownNudgeTime", (v) => change({ notifyShutdown: v }))}
        <CardRow>
          <SettingRow label="Quiet hours" hint={QUIET_HOURS_HINT}>
            <View style={styles.quiet}>
              <Button label={values.quietHoursStart || "Start"} accessibilityLabel={`Quiet hours start, ${values.quietHoursStart || "none"}`} onPress={() => setTime("quietHoursStart")} />
              <Text style={[styles.dash, { color: c.ink3 }]}>–</Text>
              <Button label={values.quietHoursEnd || "End"} accessibilityLabel={`Quiet hours end, ${values.quietHoursEnd || "none"}`} onPress={() => setTime("quietHoursEnd")} />
              {values.quietHoursStart || values.quietHoursEnd ? <Button variant="quiet" label="None" accessibilityLabel="No quiet hours" onPress={() => change({ quietHoursStart: null, quietHoursEnd: null })} /> : null}
            </View>
          </SettingRow>
        </CardRow>
        <CardRow>
          <SwitchRow label="Badge on the app icon" hint={BADGE_HINT} checked={values.badgeEnabled} onChange={(v) => change({ badgeEnabled: v })} />
        </CardRow>
      </Group>
      <ChoiceSheet open={leading} title="Remind me" options={BLOCK_LEADS.map((m) => ({ value: m as number, label: leadLabel(m) }))} value={values.blockStartLeadMin} onChange={(m) => change({ blockStartLeadMin: m })} onClose={() => setLeading(false)} />
      {(Object.keys(TIME_TITLES) as TimeKey[]).map((key) => (
        <TimeSheet key={key} open={time === key} title={TIME_TITLES[key]} value={values[key]} onSet={(v) => change({ [key]: v })} onClose={() => setTime(null)} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  under: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingBottom: 10 },
  quietFirst: { marginLeft: -12 },
  quiet: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  dash: { fontFamily: font.regular, fontSize: 17 },
});
