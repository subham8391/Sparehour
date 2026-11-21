"use client";
// Settings › Connected apps (DECISIONS.md, amendment 2026-10-23): the address to give Claude, and each app the person
// has let in, with what it may do (read and change, or read only) and Disconnect. Read from /api/connections when
// opened: connections are the auth server's, not synced rows, so this section needs the network.
import { useState } from "react";
import { Button } from "@/ui/button";
import { Segmented } from "@/ui/segmented";
import { ERROR, HINT, LABEL, NOTE, ROW } from "../rows";
// What an app may do, when it was connected and the section's sentences are shared with the Android app (section-words.ts).
import { ACCESS, CONNECTIONS, connectedOn } from "../section-words";
import { Section } from "../settings-ui";
import type { SettingsFormProps } from "../types";
import { useConnections } from "../use-connections";

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- every section takes the form's props
export function ConnectionsSection(_: SettingsFormProps) {
  // Reading the list and the two changes are the section's own state (use-connections.ts), shared with the Android app.
  const { state, busy, error, load, change, disconnect } = useConnections();
  const [copied, setCopied] = useState(false);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Section
      title="Connected apps"
      note={<p className={NOTE}>{CONNECTIONS.note}</p>}
    >
      {state.kind === "loading" && (
        <div className={ROW}>
          <span className={HINT}>Loading…</span>
        </div>
      )}
      {state.kind === "offline" && (
        <div className={ROW}>
          <span className={HINT}>{CONNECTIONS.offline}</span>
          <Button onClick={() => void load()}>Try again</Button>
        </div>
      )}
      {state.kind === "ready" && (
        <>
          <div className={ROW}>
            <span className="flex min-w-0 flex-col">
              <span className={LABEL}>Connect Claude</span>
              <span className={HINT}>{CONNECTIONS.connectHint}</span>
              <code className="mt-1 text-body-sm break-all text-ink">{state.endpoint}</code>
            </span>
            <Button onClick={() => void copy(state.endpoint)}>{copied ? "Copied" : "Copy"}</Button>
          </div>
          {!state.available && (
            <div className={ROW}>
              <span className={HINT}>{CONNECTIONS.unavailable}</span>
            </div>
          )}
          {state.apps.map((app) => (
            <div key={app.clientId} role="group" aria-label={app.name} className={ROW}>
              <span className="flex min-w-0 flex-col">
                <span className={LABEL}>{app.name}</span>
                {connectedOn(app.connectedAt) && <span className={HINT}>{connectedOn(app.connectedAt)}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Segmented label={CONNECTIONS.accessLabel(app.name)} options={ACCESS} value={app.access} onChange={(v) => void change(app, v)} />
                <Button tone="destructive" disabled={busy === app.clientId} onClick={() => void disconnect(app)}>
                  Disconnect
                </Button>
              </span>
            </div>
          ))}
          {state.apps.length === 0 && state.available && (
            <div className={ROW}>
              <span className={HINT}>{CONNECTIONS.none}</span>
            </div>
          )}
          {error && (
            <div className={ROW}>
              <p role="alert" className={ERROR}>
                {error}
              </p>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
