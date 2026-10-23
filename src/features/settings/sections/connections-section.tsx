"use client";
// Settings › Connected apps (DECISIONS.md, amendment 2026-10-23): the address to give Claude, and each app the person
// has let in, with what it may do (read and change, or read only) and Disconnect. Read from /api/connections when
// opened: connections are the auth server's, not synced rows, so this section needs the network.
import { useCallback, useEffect, useState } from "react";
import { formatDay } from "@/core/time/format-day";
import { Temporal } from "@/core/time";
import { Button } from "@/ui/button";
import { Segmented } from "@/ui/segmented";
import { ERROR, HINT, LABEL, NOTE, ROW } from "../rows";
import { Section } from "../settings-ui";
import type { SettingsFormProps } from "../types";

interface ConnectedApp {
  clientId: string;
  name: string;
  access: "read" | "write";
  connectedAt: string | null;
}

type State = { kind: "loading" } | { kind: "offline" } | { kind: "ready"; apps: ConnectedApp[]; endpoint: string; available: boolean };

const ACCESS = [
  { value: "write", label: "Read and change" },
  { value: "read", label: "Read only" },
] as const;

function connectedOn(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const day = Temporal.Instant.from(iso).toZonedDateTimeISO(Temporal.Now.timeZoneId()).toPlainDate();
    return `Connected ${formatDay(day, { today: Temporal.Now.plainDateISO() })}`;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- every section takes the form's props
export function ConnectionsSection(_: SettingsFormProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/connections", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: "ready", ...((await res.json()) as { apps: ConnectedApp[]; endpoint: string; available: boolean }) });
    } catch {
      setState({ kind: "offline" });
    }
  }, []);

  useEffect(() => {
    // The first read once the section opens; it sets state when it lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const change = async (app: ConnectedApp, access: ConnectedApp["access"]) => {
    setBusy(app.clientId);
    setError(null);
    const res = await fetch("/api/connections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: app.clientId, access }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(`Couldn’t change what ${app.name} may do. Check your connection and try again.`);
    setState((s) => (s.kind === "ready" ? { ...s, apps: s.apps.map((a) => (a.clientId === app.clientId ? { ...a, access } : a)) } : s));
  };

  const disconnect = async (app: ConnectedApp) => {
    setBusy(app.clientId);
    setError(null);
    const res = await fetch(`/api/connections?clientId=${encodeURIComponent(app.clientId)}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(`Couldn’t disconnect ${app.name}. Check your connection and try again.`);
    setState((s) => (s.kind === "ready" ? { ...s, apps: s.apps.filter((a) => a.clientId !== app.clientId) } : s));
  };

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
      note={<p className={NOTE}>An app sees your tasks, projects, lists and calendar busy times. Disconnecting stops it at once.</p>}
    >
      {state.kind === "loading" && (
        <div className={ROW}>
          <span className={HINT}>Loading…</span>
        </div>
      )}
      {state.kind === "offline" && (
        <div className={ROW}>
          <span className={HINT}>Connected apps need a connection to the internet.</span>
          <Button onClick={() => void load()}>Try again</Button>
        </div>
      )}
      {state.kind === "ready" && (
        <>
          <div className={ROW}>
            <span className="flex min-w-0 flex-col">
              <span className={LABEL}>Connect Claude</span>
              <span className={HINT}>In Claude, add a custom connector with this address, then sign in here when it asks.</span>
              <code className="mt-1 text-body-sm break-all text-ink">{state.endpoint}</code>
            </span>
            <Button onClick={() => void copy(state.endpoint)}>{copied ? "Copied" : "Copy"}</Button>
          </div>
          {!state.available && (
            <div className={ROW}>
              <span className={HINT}>Connecting apps isn’t switched on for this server yet.</span>
            </div>
          )}
          {state.apps.map((app) => (
            <div key={app.clientId} role="group" aria-label={app.name} className={ROW}>
              <span className="flex min-w-0 flex-col">
                <span className={LABEL}>{app.name}</span>
                {connectedOn(app.connectedAt) && <span className={HINT}>{connectedOn(app.connectedAt)}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Segmented label={`What ${app.name} may do`} options={ACCESS} value={app.access} onChange={(v) => void change(app, v)} />
                <Button tone="destructive" disabled={busy === app.clientId} onClick={() => void disconnect(app)}>
                  Disconnect
                </Button>
              </span>
            </div>
          ))}
          {state.apps.length === 0 && state.available && (
            <div className={ROW}>
              <span className={HINT}>No apps connected yet.</span>
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
