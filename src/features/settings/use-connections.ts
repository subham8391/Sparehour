// Settings › Connected apps' state (DECISIONS.md, amendment 2026-10-23): the apps the person has let in, read from
// /api/connections when the section opens (connections are the auth server's, not synced rows, so this needs the
// network), and the two changes: what an app may do, and Disconnect. Free of the web's screen parts, so the web's
// section (sections/connections-section.tsx) and the Android app's ask, change and fail the same way
// (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { useCallback, useEffect, useState } from "react";
import type { ApiFetch } from "@/features/finished/finished";
import { CONNECTIONS, type ConnectedApp } from "./section-words";

export type ConnectionsState = { kind: "loading" } | { kind: "offline" } | { kind: "ready"; apps: ConnectedApp[]; endpoint: string; available: boolean };

export interface Connections {
  state: ConnectionsState;
  /** The app a change is on its way for (its client id); null when none is. */
  busy: string | null;
  /** The last change that failed, as a sentence to show. */
  error: string | null;
  /** Reads the list again ("Try again"). */
  load: () => Promise<void>;
  change: (app: ConnectedApp, access: ConnectedApp["access"]) => Promise<void>;
  disconnect: (app: ConnectedApp) => Promise<void>;
}

/**
 * `api` is how the server is reached where a plain fetch cannot: the Android app has no cookie and no origin, so it
 * hands in its own call (mobile/src/api.ts). Left out, as on the web, it is the browser's fetch.
 */
export function useConnections(api?: ApiFetch): Connections {
  const [state, setState] = useState<ConnectionsState>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await (api ?? fetch)("/api/connections", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: "ready", ...((await res.json()) as { apps: ConnectedApp[]; endpoint: string; available: boolean }) });
    } catch {
      setState({ kind: "offline" });
    }
  }, [api]);

  useEffect(() => {
    // The first read once the section opens; it sets state when it lands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const change = async (app: ConnectedApp, access: ConnectedApp["access"]) => {
    setBusy(app.clientId);
    setError(null);
    const res = await (api ?? fetch)("/api/connections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: app.clientId, access }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(CONNECTIONS.changeFailed(app.name));
    setState((s) => (s.kind === "ready" ? { ...s, apps: s.apps.map((a) => (a.clientId === app.clientId ? { ...a, access } : a)) } : s));
  };

  const disconnect = async (app: ConnectedApp) => {
    setBusy(app.clientId);
    setError(null);
    const res = await (api ?? fetch)(`/api/connections?clientId=${encodeURIComponent(app.clientId)}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setError(CONNECTIONS.disconnectFailed(app.name));
    setState((s) => (s.kind === "ready" ? { ...s, apps: s.apps.filter((a) => a.clientId !== app.clientId) } : s));
  };

  return { state, busy, error, load, change, disconnect };
}
