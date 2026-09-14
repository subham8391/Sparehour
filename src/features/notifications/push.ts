// Web Push on the client (SYSTEM_DESIGN.md §7.3, SCREENS.md §18 "permission
// status, honestly stated"): what this browser can do, the words for each
// state, the subscription as a row, and the deep link a notification opens.
// Pure, so every platform's copy is tested without a device.
import { isPushAction, isPushKind, type PushAction, type PushKind } from "./actions";

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

export interface PushPlatform {
  isIOS: boolean;
  isSafari: boolean;
  isFirefox: boolean;
  standalone: boolean;
  ua: string;
}

export function detectPushPlatform(nav: Pick<Navigator, "userAgent"> & { standalone?: boolean }, standaloneMedia: boolean): PushPlatform {
  const ua = nav.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && "standalone" in nav);
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/.test(ua);
  return { isIOS, isSafari, isFirefox: /Firefox/.test(ua), standalone: standaloneMedia || nav.standalone === true, ua };
}

/** The `platform` column of a subscription. */
export function platformKey(p: PushPlatform): "ios-standalone" | "android" | "desktop" | "other" {
  if (p.isIOS) return p.standalone ? "ios-standalone" : "other";
  if (/Android/.test(p.ua)) return "android";
  return "desktop";
}

/** What the browser says, or "unsupported" when the APIs are not there (or the page is not secure). */
export function readPermission(win: { Notification?: { permission: NotificationPermission }; PushManager?: unknown; isSecureContext?: boolean }): PermissionState {
  if (!win.Notification || !win.PushManager || win.isSecureContext === false) return "unsupported";
  return win.Notification.permission;
}

export interface PermissionCopy {
  headline: string;
  detail: string | null;
  /** How to lift a block, for this browser. */
  steps: string[];
  action: "enable" | "disable" | "install" | null;
}

/** The Notifications row in Settings: the state as it is, and the one thing to do about it. */
export function permissionCopy(state: PermissionState, p: PushPlatform, subscribed: boolean, workerAvailable: boolean): PermissionCopy {
  if (state === "unsupported") return { headline: "This browser can't show reminders.", detail: p.isIOS ? "On iPhone and iPad, reminders work once Sparehour is on your Home Screen." : null, steps: [], action: null };
  if (p.isIOS && !p.standalone) return { headline: "Reminders need the Home Screen app.", detail: "iPhone only allows notifications for installed apps.", steps: ["Tap Share in Safari", "Choose “Add to Home Screen”", "Open Sparehour from your Home Screen and turn reminders on here"], action: "install" };
  if (state === "denied") return { headline: "Blocked in your browser.", detail: "Sparehour can't ask again — lift the block, then come back here.", steps: deniedSteps(p), action: null };
  if (!workerAvailable) return { headline: "Reminders aren't available in this build.", detail: "They need the installed app (the service worker is only registered in production).", steps: [], action: null };
  if (state === "granted" && subscribed) return { headline: "Reminders are on for this device.", detail: "Block starts, deadlines and the morning nudge, unless quiet hours say otherwise.", steps: [], action: "disable" };
  if (state === "granted") return { headline: "Allowed, but not turned on here yet.", detail: null, steps: [], action: "enable" };
  return { headline: "Reminders are off.", detail: "Your browser will ask once.", steps: [], action: "enable" };
}

function deniedSteps(p: PushPlatform): string[] {
  if (p.isIOS) return ["Open Settings → Notifications → Sparehour", "Allow notifications"];
  if (p.isSafari) return ["Safari → Settings → Websites → Notifications", "Set Sparehour to Allow"];
  if (p.isFirefox) return ["Click the permissions icon left of the address bar", "Remove the block on notifications"];
  return ["Click the icon left of the address bar", "Notifications → Allow"];
}

/** The VAPID public key as the bytes `subscribe()` wants. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  ua: string;
  platform: ReturnType<typeof platformKey>;
  declarative: boolean;
}

/** A browser subscription as the row we keep; null when the browser gave us nothing usable. */
export function subscriptionRow(json: { endpoint?: string | null; keys?: Record<string, string> | null }, p: PushPlatform): SubscriptionRow | null {
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth, ua: p.ua.slice(0, 200), platform: platformKey(p), declarative: p.isSafari || p.isIOS };
}

export interface DeepLink {
  kind: PushKind;
  taskId: string | null;
  blockId: string | null;
  /** Set when a notification button was pressed; null for a plain tap. */
  action: PushAction | null;
}

/** `?src=push&kind=…&task=…&block=…&action=…` on any screen; null when the URL is not from a notification. */
export function parseDeepLink(params: URLSearchParams): DeepLink | null {
  if (params.get("src") !== "push") return null;
  const kind = params.get("kind");
  if (!isPushKind(kind)) return null;
  const action = params.get("action");
  return { kind, taskId: params.get("task"), blockId: params.get("block"), action: isPushAction(action) ? action : null };
}
