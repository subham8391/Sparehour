"use client";
// The device's push subscription (SYSTEM_DESIGN.md §7.3): asked for from a
// button, never on load; re-registered on every launch so an iOS
// subscription that vanished is noticed; turned off by unsubscribing and
// retiring the row. Rows are written straight to push_subscriptions under
// RLS — they are per device and never sync.
import { useCallback, useEffect, useMemo, useState } from "react";
import { detectPushPlatform, permissionCopy, readPermission, subscriptionRow, urlBase64ToUint8Array, type PermissionCopy, type PermissionState, type PushPlatform } from "./push";

// The Supabase client is loaded when a subscription is written, not with the
// Settings shell (SYSTEM_DESIGN.md §11.6 budgets).
const supabase = async () => (await import("@/data/supabase-browser")).supabaseBrowser();

export interface PushApi {
  permission: PermissionState;
  subscribed: boolean;
  /** A service worker is registered here (production builds). */
  workerAvailable: boolean;
  busy: boolean;
  error: string | null;
  copy: PermissionCopy;
  platform: PushPlatform;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  /** Sends a test to this account's devices; resolves how many were reached. */
  sendTest: () => Promise<number>;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration("/")) ?? null;
  } catch {
    return null;
  }
}

async function saveSubscription(sub: PushSubscription, platform: PushPlatform): Promise<void> {
  const row = subscriptionRow(sub.toJSON(), platform);
  if (!row) throw new Error("The browser gave no usable subscription.");
  const client = await supabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  const { error } = await client.from("push_subscriptions").upsert({ ...row, user_id: user.id, deleted_at: null, updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) throw new Error(error.message);
}

/**
 * A failed subscribe in plain words (SCREENS.md §21). The browser's own text ("Registration failed - permission
 * denied") reads as if permission had been refused when the window simply has no push service (private windows,
 * some browsers). Messages the app wrote itself pass through.
 */
export function pushErrorWords(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (e instanceof DOMException || /registration failed|push service|not supported|AbortError|NotAllowedError/i.test(raw))
    return "This window can’t receive reminders. Private windows and some browsers have no push service; try a normal window or the installed app.";
  return raw;
}

export function usePush(): PushApi {
  const [permission, setPermission] = useState<PermissionState>(() => (typeof window === "undefined" ? "unsupported" : readPermission(window)));
  const [subscribed, setSubscribed] = useState(false);
  const [workerAvailable, setWorkerAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platform = useMemo<PushPlatform>(() => (typeof navigator === "undefined" ? { isIOS: false, isSafari: false, isFirefox: false, standalone: false, touch: false, ua: "" } : detectPushPlatform(navigator, window.matchMedia("(display-mode: standalone)").matches)), []);

  // The launch re-registration (§7.3): an existing subscription is written again so a vanished one is noticed.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const reg = await registration();
      if (cancelled) return;
      setWorkerAvailable(reg !== null);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      if (cancelled) return;
      setSubscribed(Boolean(sub));
      if (sub && readPermission(window) === "granted") await saveSubscription(sub, platform).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
      const reg = await registration();
      if (!reg) throw new Error("No service worker here — reminders need the installed app.");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Push is not configured on this server.");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      await saveSubscription(sub, platform);
      setSubscribed(true);
    } catch (e) {
      setError(pushErrorWords(e));
    } finally {
      setBusy(false);
    }
  }, [platform]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await registration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await (await supabase()).from("push_subscriptions").update({ deleted_at: new Date().toISOString() }).eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    if (!res.ok) {
      setError(res.status === 503 ? "Push is not configured on this server." : "Couldn't send the test.");
      return 0;
    }
    const body = (await res.json()) as { sent: number };
    return body.sent;
  }, []);

  const copy = useMemo(() => permissionCopy(permission, platform, subscribed, workerAvailable), [permission, platform, subscribed, workerAvailable]);
  return useMemo(() => ({ permission, subscribed, workerAvailable, busy, error, copy, platform, enable, disable, sendTest }), [permission, subscribed, workerAvailable, busy, error, copy, platform, enable, disable, sendTest]);
}
