// Settings › Connected apps on the phone (DECISIONS.md, amendment 2026-10-23; the web's
// sections/connections-section.tsx): the address to give Claude, and each app the person has let in, with what it
// may do and Disconnect. The list is the auth server's, so the section needs a connection and says so without one.
// The words and the choices are the web's own (features/settings/section-words.ts). The web's Copy is Share here:
// a phone app has no clipboard of its own to write to, and the address can also be selected and copied by hand.
// Presentational.
import { StyleSheet, Text } from "react-native";
import { ACCESS, CONNECTIONS, connectedOn, type ConnectedApp } from "@/features/settings/section-words";
import type { ConnectionsState } from "@/features/settings/use-connections";
import { Button } from "~/ui/button";
import { CardRow } from "~/ui/card";
import { Segmented } from "~/ui/segmented";
import { font, useColours } from "~/ui/theme";
import { Group, QuietRow, SettingRow } from "./parts";

export interface ConnectionsViewProps {
  state: ConnectionsState;
  /** The app a change is on its way for (its client id). */
  busy: string | null;
  error: string | null;
  onRetry: () => void;
  /** Hands the address to another app (the system's share sheet). */
  onShare: (endpoint: string) => void;
  onAccess: (app: ConnectedApp, access: ConnectedApp["access"]) => void;
  onDisconnect: (app: ConnectedApp) => void;
}

export function ConnectionsView({ state, busy, error, onRetry, onShare, onAccess, onDisconnect }: ConnectionsViewProps) {
  const c = useColours();
  return (
    <Group note={CONNECTIONS.note}>
      {state.kind === "loading" ? (
        <CardRow first>
          <QuietRow text="Loading…" />
        </CardRow>
      ) : null}
      {state.kind === "offline" ? (
        <CardRow first>
          <QuietRow text={CONNECTIONS.offline}>
            <Button label="Try again" onPress={onRetry} />
          </QuietRow>
        </CardRow>
      ) : null}
      {state.kind === "ready" ? (
        <>
          <CardRow first>
            <SettingRow label="Connect Claude" hint={CONNECTIONS.connectHint}>
              <Text selectable accessibilityLabel={`Address: ${state.endpoint}`} style={[styles.address, { color: c.ink }]}>
                {state.endpoint}
              </Text>
              <Button label="Share" accessibilityLabel="Share the address" onPress={() => onShare(state.endpoint)} style={styles.start} />
            </SettingRow>
          </CardRow>
          {!state.available ? (
            <CardRow>
              <QuietRow text={CONNECTIONS.unavailable} />
            </CardRow>
          ) : null}
          {state.apps.map((app) => (
            <CardRow key={app.clientId}>
              <SettingRow label={app.name} hint={connectedOn(app.connectedAt) ?? undefined}>
                <Segmented label={CONNECTIONS.accessLabel(app.name)} options={ACCESS} value={app.access} onChange={(v) => onAccess(app, v)} />
                <Button variant="quiet" destructive label="Disconnect" accessibilityLabel={`Disconnect ${app.name}`} disabled={busy === app.clientId} onPress={() => onDisconnect(app)} style={styles.start} />
              </SettingRow>
            </CardRow>
          ))}
          {state.apps.length === 0 && state.available ? (
            <CardRow>
              <QuietRow text={CONNECTIONS.none} />
            </CardRow>
          ) : null}
          {error ? (
            <CardRow>
              <QuietRow text={error} tone="error" />
            </CardRow>
          ) : null}
        </>
      ) : null}
    </Group>
  );
}

const styles = StyleSheet.create({
  start: { alignSelf: "flex-start" },
  address: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
});
