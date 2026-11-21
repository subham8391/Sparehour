// Settings › Calendar on the phone (SCREENS.md §18, PRODUCT_SPEC.md §10.1; the web's
// features/calendar/calendar-section.tsx): the connected accounts with their status, Sync now and Disconnect (asked
// twice, with what it leaves), every calendar with "Counts as busy" and "Hide titles", and the one calendar the
// blocks go to, with the read-all/write-one promise restated. Which calendars can take blocks, an account's status
// line and every sentence are the web's own (features/calendar/blocks-go.ts, calendar-words.ts, providers.ts).
//
// Not here yet: everything that leaves for Google's or Microsoft's consent screen: connecting an account,
// Reconnect, "Show blocks in Google Calendar", "Turn on full access" and "Add another account". Connecting from the
// phone is built separately. Presentational.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { takesBlocks, writableRole } from "@/features/calendar/blocks-go";
import type { CalendarAccountView, CalendarView as CalendarRowView } from "@/features/calendar/calendar-views";
import { BLOCKS_STAY, DISCONNECT_KEEPS, PROMISE, accountStatusLine, writeCalendarLabel } from "@/features/calendar/calendar-words";
import { PROVIDER_NAME } from "@/features/calendar/providers";
import { useSavedFlash } from "@/features/settings/saved-flash";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { Empty } from "~/ui/empty";
import { SwitchRow } from "~/ui/switch-row";
import { font, useColours } from "~/ui/theme";
import { ChoiceSheet, Group, Line, SettingRow } from "./parts";

export interface CalendarViewProps {
  accounts: readonly CalendarAccountView[];
  calendars: readonly CalendarRowView[];
  /** What the last Sync now or Disconnect came to. */
  notice: string | null;
  /** A Sync now or a Disconnect is on its way. */
  busy: boolean;
  /** The clock the "synced 12s ago" is told against; the phone's when left out. */
  now?: Date;
  onSyncNow: () => void;
  onDisconnect: (accountId: string) => void;
  onRead: (id: string, read: boolean) => void;
  onPrivate: (id: string, isPrivate: boolean) => void;
  onWriteTarget: (id: string | null) => void;
}

/** "None" in the write-calendar sheet: blocks stay in Sparehour. */
const NONE = "";

export function CalendarView({ accounts, calendars, notice, busy, now, onSyncNow, onDisconnect, onRead, onPrivate, onWriteTarget }: CalendarViewProps) {
  const c = useColours();
  const [saved, flash] = useSavedFlash();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const clock = now ?? new Date();
  const writeCandidates = calendars.filter((cal) => takesBlocks(cal, accounts));
  const writeTarget = calendars.find((cal) => cal.writeTarget) ?? null;
  const accountOf = (cal: CalendarRowView) => accounts.find((a) => a.id === cal.accountId);
  const has = (provider: CalendarAccountView["provider"]) => accounts.some((a) => a.provider === provider);
  // With both connected, each calendar says whose it is: Outlook's is often just "Calendar".
  const mixed = has("google") && has("microsoft");

  if (accounts.length === 0)
    return (
      <>
        {notice ? <Line text={notice} status /> : null}
        <Empty title="No calendar connected." line={PROMISE.read}>
          <Text style={[styles.promise, { color: c.ink3 }]}>{PROMISE.write}</Text>
        </Empty>
      </>
    );

  return (
    <>
      {notice ? <Line text={notice} status /> : null}
      <Group saved={saved}>
        {accounts.map((a, i) => (
          <CardRow key={a.id} first={i === 0}>
            <View style={styles.account}>
              <Text style={[styles.name, { color: c.ink }]}>
                {PROVIDER_NAME[a.provider]}
                <Text style={[styles.email, { color: c.ink2 }]}>{`  ${a.email ?? "—"}`}</Text>
              </Text>
              <Text style={[styles.status, { color: c.ink3 }]}>{accountStatusLine(a, clock)}</Text>
              {a.lastError && a.status === "ok" ? <Line text={a.lastError} tone="error" flush /> : null}
              {confirming === a.id ? (
                <View style={styles.actions}>
                  <Text style={[styles.keeps, { color: c.ink2 }]}>{DISCONNECT_KEEPS}</Text>
                  {/* Disconnect is one of the two destructive actions in the product (DESIGN_SYSTEM.md §2). */}
                  <Button
                    variant="quiet"
                    destructive
                    label="Disconnect"
                    accessibilityLabel={`Disconnect ${PROVIDER_NAME[a.provider]} ${a.email ?? ""}`.trim()}
                    disabled={busy}
                    onPress={() => {
                      setConfirming(null);
                      onDisconnect(a.id);
                    }}
                  />
                  <Button variant="quiet" label="Keep" onPress={() => setConfirming(null)} />
                </View>
              ) : (
                <View style={styles.actions}>
                  {a.status === "ok" ? <Button label="Sync now" disabled={busy} onPress={onSyncNow} /> : null}
                  <Button variant="quiet" label="Disconnect…" accessibilityLabel={`Disconnect ${PROVIDER_NAME[a.provider]} ${a.email ?? ""}…`} disabled={busy} onPress={() => setConfirming(a.id)} />
                </View>
              )}
            </View>
          </CardRow>
        ))}
      </Group>

      {calendars.length > 0 ? (
        <>
          <Line text={PROMISE.read} />
          <View style={styles.gapTop}>
            <Card>
              {calendars.map((cal, i) => (
                <CardRow key={cal.id} first={i === 0}>
                  <View style={styles.calendar}>
                    {/* The calendar's own colour from its provider, a data value, not a token. */}
                    <View aria-hidden style={[styles.dot, { backgroundColor: cal.color ?? c.meetFill }]} />
                    <Text numberOfLines={1} style={[styles.calendarName, { color: c.ink }]}>
                      {cal.summary}
                    </Text>
                    {mixed ? <Text style={[styles.status, { color: c.ink3 }]}>{accountOf(cal)?.provider === "microsoft" ? "Outlook" : "Google"}</Text> : null}
                    {!writableRole(cal.accessRole) ? <Chip label="read-only" /> : null}
                  </View>
                  <Toggle
                    label="Counts as busy"
                    accessibilityLabel={`${cal.summary}, counts as busy`}
                    checked={cal.read}
                    onChange={(v) => {
                      onRead(cal.id, v);
                      flash();
                    }}
                  />
                  {/* Busy times carry no titles, so there is nothing to hide until full access is on. */}
                  {(accountOf(cal)?.titles ?? true) ? (
                    <Toggle
                      label="Hide titles"
                      accessibilityLabel={`${cal.summary}, hide titles`}
                      checked={cal.private}
                      onChange={(v) => {
                        onPrivate(cal.id, v);
                        flash();
                      }}
                    />
                  ) : null}
                </CardRow>
              ))}
            </Card>
          </View>
          <View style={styles.gapTop}>
            <Card>
              <SettingRow label="Blocks go to" hint={PROMISE.write} value={writeTarget ? writeCalendarLabel(writeTarget) : BLOCKS_STAY} accessibilityLabel="Blocks go to" onPress={() => setPicking(true)} />
            </Card>
          </View>
          {/* No Outlook calendar is ever among the choices: nothing is written there, and the line says so. */}
          {has("microsoft") ? <Line text={PROMISE.outlookWrite} /> : null}
        </>
      ) : null}
      <ChoiceSheet
        open={picking}
        title="Blocks go to"
        options={[...writeCandidates.map((cal) => ({ value: cal.id, label: writeCalendarLabel(cal) })), { value: NONE, label: BLOCKS_STAY }]}
        value={writeTarget?.id ?? NONE}
        onChange={(id) => {
          onWriteTarget(id === NONE ? null : id);
          flash();
        }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}

/**
 * A calendar's switch that flips on the tap: it shows what was just chosen while the write makes its way through
 * the local database, and a second tap flips from what is shown. The row's value wins again once it changes.
 */
function Toggle({ label, accessibilityLabel, checked, onChange }: { label: string; accessibilityLabel: string; checked: boolean; onChange: (v: boolean) => void }) {
  const [shown, setShown] = useState(checked);
  const [seen, setSeen] = useState(checked);
  if (seen !== checked) {
    setSeen(checked);
    setShown(checked);
  }
  return (
    <SwitchRow
      label={label}
      accessibilityLabel={accessibilityLabel}
      checked={shown}
      onChange={(v) => {
        setShown(v);
        onChange(v);
      }}
    />
  );
}

const styles = StyleSheet.create({
  promise: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  account: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  name: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  email: { fontFamily: font.regular, fontSize: 16 },
  status: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, marginTop: 6 },
  keeps: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginRight: 4 },
  gapTop: { marginTop: 12 },
  calendar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  calendarName: { flexShrink: 1, fontFamily: font.medium, fontSize: 17 },
});
