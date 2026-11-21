// Settings › Calendar on the phone (SCREENS.md §18, PRODUCT_SPEC.md §10.1; the web's
// features/calendar/calendar-section.tsx): connecting a calendar (Google, and Outlook where the server can), the
// connected accounts with their status, Sync now or Reconnect, and Disconnect (asked twice, with what it leaves);
// every calendar with "Counts as busy" and "Hide titles"; the one calendar the blocks go to, with the
// read-all/write-one promise restated, and "Show blocks in Google Calendar" while no account writes; full access,
// with Google's warning screen named first; and adding another account. Which calendars can take blocks, what is
// offered about connecting and when, an account's status line and every sentence are the web's own
// (features/calendar/blocks-go.ts, connect-offers.ts, calendar-words.ts, providers.ts). Presentational: leaving for
// a consent screen is handed in.
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { takesBlocks, writableRole } from "@/features/calendar/blocks-go";
import type { CalendarAccountView, CalendarView as CalendarRowView } from "@/features/calendar/calendar-views";
import { BLOCKS_STAY, DISCONNECT_KEEPS, PROMISE, accountStatusLine, writeCalendarLabel } from "@/features/calendar/calendar-words";
import { CONNECT, CONNECT_PROVIDERS, canConnect, canReconnect, connectMoreLabel, offersFullAccess, offersProvider, offersShowBlocks } from "@/features/calendar/connect-offers";
import { PROVIDER_NAME, type CalendarProviderId } from "@/features/calendar/providers";
import { useSavedFlash } from "@/features/settings/saved-flash";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { Icon } from "~/ui/icon";
import { SwitchRow } from "~/ui/switch-row";
import { font, useColours } from "~/ui/theme";
import { ChoiceSheet, Group, Line, SettingRow } from "./parts";

export interface CalendarViewProps {
  accounts: readonly CalendarAccountView[];
  calendars: readonly CalendarRowView[];
  /** Whether the server can connect Google; null while it is still being asked. */
  configured: boolean | null;
  /** True only once the server has said it can connect Outlook: until then, and where it cannot, Outlook is not shown at all. */
  outlook: boolean;
  /** What the last Sync now, Disconnect or consent came to. */
  notice: string | null;
  /** A Sync now, a Disconnect or a consent is on its way. */
  busy: boolean;
  /** The clock the "synced 12s ago" is told against; the phone's when left out. */
  now?: Date;
  /** Opens the provider's consent, to connect an account or to reconnect one. */
  onConnect: (provider: CalendarProviderId) => void;
  /** Asks Google to let Sparehour keep a "Sparehour" calendar for the blocks. */
  onAllowWrite: () => void;
  /** Asks Google for full access: titles, and blocks on the person's own calendars. */
  onFullAccess: () => void;
  onSyncNow: () => void;
  onDisconnect: (accountId: string) => void;
  onRead: (id: string, read: boolean) => void;
  onPrivate: (id: string, isPrivate: boolean) => void;
  onWriteTarget: (id: string | null) => void;
}

/** "None" in the write-calendar sheet: blocks stay in Sparehour. */
const NONE = "";

export function CalendarView({ accounts, calendars, configured, outlook, notice, busy, now, onConnect, onAllowWrite, onFullAccess, onSyncNow, onDisconnect, onRead, onPrivate, onWriteTarget }: CalendarViewProps) {
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
  const ability = { configured, outlook };

  if (accounts.length === 0)
    return (
      <>
        {notice ? <Line text={notice} status /> : null}
        <Card style={styles.connect}>
          <Text style={[styles.connectTitle, { color: c.ink }]}>{CONNECT.title}</Text>
          <Text style={[styles.promise, { color: c.ink2 }]}>{PROMISE.read}</Text>
          <Text style={[styles.promise, { color: c.ink2 }]}>{PROMISE.write}</Text>
          {outlook ? <Text style={[styles.promise, { color: c.ink2 }]}>{`${PROMISE.outlookRead} ${PROMISE.outlookWrite}`}</Text> : null}
          <View style={styles.connectButtons}>
            {/* Where only Outlook can be connected, Google's button would lead nowhere and is left out. */}
            {offersProvider("google", ability) ? <Button variant="primary" label={CONNECT.google} disabled={busy || !canConnect("google", ability)} onPress={() => onConnect("google")} /> : null}
            {offersProvider("microsoft", ability) ? <Button variant="primary" label={CONNECT.outlook} disabled={busy} onPress={() => onConnect("microsoft")} /> : null}
          </View>
          {configured === false && !outlook ? <Text style={[styles.status, { color: c.ink3 }]}>{CONNECT.notSetUp}</Text> : null}
        </Card>
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
                  {a.status === "ok" ? <Button label="Sync now" disabled={busy} onPress={onSyncNow} /> : <Button variant="primary" label={CONNECT.reconnect} accessibilityLabel={`${CONNECT.reconnect} ${PROVIDER_NAME[a.provider]} ${a.email ?? ""}`.trim()} disabled={busy || !canReconnect(a.provider, ability)} onPress={() => onConnect(a.provider)} />}
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
          {/* Showing blocks is Google's own step, offered once a Google account is connected. */}
          {offersShowBlocks(accounts) ? (
            <View style={styles.offer}>
              <Button label={CONNECT.showBlocks} disabled={busy || !canConnect("google", ability)} onPress={onAllowWrite} style={styles.start} />
              <Line text={CONNECT.showBlocksNote} flush />
            </View>
          ) : null}
        </>
      ) : null}

      {offersFullAccess(accounts) ? (
        <View style={styles.gapTop}>
          <Card>
            <SettingRow label={CONNECT.fullTitle} hint={CONNECT.fullSays}>
              <Button label={CONNECT.full} disabled={busy || !canConnect("google", ability)} onPress={onFullAccess} style={styles.start} />
              <Line text={CONNECT.fullNote} flush />
            </SettingRow>
          </Card>
        </View>
      ) : null}

      {/* One button for each provider the server can connect; Google's stays, disabled, while the server is still being asked. */}
      <View style={styles.more}>
        {CONNECT_PROVIDERS.map((provider) =>
          offersProvider(provider, ability) ? (
            <Button key={provider} variant="quiet" icon={<Icon name="plus" size={16} color={c.ink2} />} label={connectMoreLabel(provider, accounts)} disabled={busy || !canConnect(provider, ability)} onPress={() => onConnect(provider)} />
          ) : null,
        )}
      </View>
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
  connect: { paddingHorizontal: 18, paddingVertical: 20, gap: 8 },
  connectTitle: { fontFamily: font.medium, fontSize: 20, lineHeight: 26 },
  promise: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  connectButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  offer: { marginHorizontal: 16, marginTop: 12, gap: 6 },
  start: { alignSelf: "flex-start" },
  more: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 4, marginTop: 8 },
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
