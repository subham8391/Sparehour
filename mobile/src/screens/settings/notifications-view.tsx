// Settings › Notifications on the phone (SCREENS.md §18, PRODUCT_SPEC.md §14; the web's
// sections/notifications-section.tsx): first, as on the web, this device's own reminders, honestly stated, with the
// one useful action (Turn on reminders, Turn off, or, when Android blocks them, the way to its settings); then the
// account's reminder settings, which every device shares: the category switches, how early a block reminder comes,
// when the morning and shutdown nudges come (from working hours unless a time is chosen), quiet hours, which drop
// what falls inside them, and the badge. The choices and the sentences are the web's own (notify-rules.ts,
// section-words.ts, push.ts read for the phone by ~/push/copy.ts). Presentational.
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import type { SettingsPatch } from "@/data/repositories/settings-repo";
import type { PermissionCopy } from "@/features/notifications/push";
import { BLOCK_LEADS, leadLabel, nudgeHint, suggestedNudgeTime } from "@/features/settings/notify-rules";
import { useSavedFlash } from "@/features/settings/saved-flash";
import { BADGE_HINT, NEVER_LATE, QUIET_HOURS_HINT } from "@/features/settings/section-words";
import type { Segment } from "@/features/settings/settings-rules";
import type { SettingsValues } from "@/features/settings/settings-values";
import { Button } from "~/ui/button";
import { CardRow } from "~/ui/card";
import { SwitchRow } from "~/ui/switch-row";
import { font, useColours } from "~/ui/theme";
import { OPEN_SETTINGS } from "~/push/copy";
import { ChoiceSheet, Group, Line, SettingRow, TimeSheet } from "./parts";

/** This device's reminders: the words for its state, and what can be done about it. */
export interface DeviceReminders {
  copy: PermissionCopy;
  busy: boolean;
  error: string | null;
  onEnable: () => void;
  onDisable: () => void;
  /** Opens Android's own settings for the app, where a block is lifted. */
  onOpenSettings: () => void;
}

export interface NotificationsViewProps {
  values: SettingsValues;
  /** The working week, for the time "Choose a time" starts from. */
  workHours: readonly (readonly Segment[])[];
  onChange: (patch: SettingsPatch) => void;
  /** This device's reminders; null while Android's answer is being read (a moment). */
  device: DeviceReminders | null;
}

type TimeKey = "morningNudgeTime" | "shutdownNudgeTime" | "quietHoursStart" | "quietHoursEnd";
const TIME_TITLES: Record<TimeKey, string> = {
  morningNudgeTime: "Morning nudge time",
  shutdownNudgeTime: "Shutdown nudge time",
  quietHoursStart: "Quiet hours start",
  quietHoursEnd: "Quiet hours end",
};

export function NotificationsView({ values, workHours, onChange, device }: NotificationsViewProps) {
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
        {device ? (
          <CardRow first>
            <DeviceRow device={device} />
          </CardRow>
        ) : null}
        <CardRow first={!device}>
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

/** "Reminders on this device": the state in the web's words, its detail, how to lift a block, and the one action. */
function DeviceRow({ device }: { device: DeviceReminders }) {
  const c = useColours();
  const { copy, busy, error } = device;
  const blocked = copy.action === null && copy.steps.length > 0;
  return (
    <SettingRow label="Reminders on this device" hint={copy.headline}>
      {copy.detail ? <Text style={[styles.detail, { color: c.ink2 }]}>{copy.detail}</Text> : null}
      {copy.steps.length > 0 ? (
        <View style={styles.steps}>
          {copy.steps.map((step, i) => (
            <Text key={step} style={[styles.detail, { color: c.ink2 }]}>{`${i + 1}. ${step}`}</Text>
          ))}
        </View>
      ) : null}
      {copy.action === "enable" ? <Button variant="primary" label="Turn on reminders" disabled={busy} onPress={device.onEnable} style={styles.action} /> : null}
      {copy.action === "disable" ? <Button variant="quiet" label="Turn off" accessibilityLabel="Turn off reminders on this device" disabled={busy} onPress={device.onDisable} style={styles.quietAction} /> : null}
      {blocked ? <Button label={OPEN_SETTINGS} onPress={device.onOpenSettings} style={styles.action} /> : null}
      {error ? <Line text={error} tone="error" flush /> : null}
    </SettingRow>
  );
}

const styles = StyleSheet.create({
  detail: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  steps: { gap: 2 },
  action: { alignSelf: "flex-start" },
  quietAction: { alignSelf: "flex-start", marginLeft: -12 },
  under: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingBottom: 10 },
  quietFirst: { marginLeft: -12 },
  quiet: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  dash: { fontFamily: font.regular, fontSize: 17 },
});
