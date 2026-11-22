// This device's reminders (SYSTEM_DESIGN.md §7.3, the phone's way): Android's notification channel and permission,
// the Expo push address (token) the server sends reminders to, and the device's own memory that reminders were turned
// on here. The web keeps a browser's push subscription as a row; the phone hands its token to the web app's server
// (`POST` / `DELETE /api/push/app-token`, with the session's token as a bearer, ~/api), and the server sends each
// reminder through Expo's push service (FCM underneath). Asked for from a button, never on load; registered again on
// every launch so a vanished token is noticed, as the web does; given back before the session goes at sign-out.
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import type { PermissionState } from "@/features/notifications/push";
import { apiFetch } from "~/api";

/** The Android channel every reminder is sent on (the server's `channelId`). */
export const CHANNEL_ID = "reminders";
/** Where this device remembers the token it registered: present means reminders were turned on here. */
export const STORE_KEY = "sparehour.reminders";
const TOKEN_PATH = "/api/push/app-token";
/** How long sign-out waits for the server to let go of the token before it goes ahead anyway. */
export const FORGET_WAIT_MS = 4000;

/** A failure with words for the Settings row. */
export class ReminderError extends Error {}

export const WORDS = {
  noToken: "Android didn’t give this phone a reminder address. Check your connection and try again.",
  notSignedIn: "Not signed in.",
  refused: "The server didn’t take this phone’s reminder address. Try again in a moment.",
  failed: "Couldn’t reach Sparehour. Check your connection and try again.",
  notOff: "Couldn’t turn reminders off just now. Check your connection and try again.",
};

/** Whether this build can receive pushes at all: Expo Go cannot (SDK 53 and later). */
export function pushAvailable(): boolean {
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

/** The EAS project the token belongs to (app.json `extra.eas.projectId`). */
function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Android's answer in the web's words. A refusal Android will still ask about again (Android 13 asks twice) is "not
 * asked yet": only a refusal it will not ask about again is blocked.
 */
export function asPermission(status: { status: string; granted?: boolean; canAskAgain?: boolean }): PermissionState {
  if (status.granted || status.status === "granted") return "granted";
  if (status.status === "denied" && status.canAskAgain === false) return "denied";
  return "default";
}

export async function readPermission(): Promise<PermissionState> {
  try {
    return asPermission(await Notifications.getPermissionsAsync());
  } catch {
    return "unsupported";
  }
}

/** The channel reminders arrive on: made before the first ask, as Android 13 wants a channel before its box shows. */
export async function ensureChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: "Reminders", importance: Notifications.AndroidImportance.HIGH });
}

export async function requestPermission(): Promise<PermissionState> {
  return asPermission(await Notifications.requestPermissionsAsync());
}

async function expoToken(): Promise<string> {
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
  } catch {
    throw new ReminderError(WORDS.noToken);
  }
}

async function send(method: "POST" | "DELETE", token: string): Promise<Response> {
  try {
    return await apiFetch(TOKEN_PATH, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  } catch {
    throw new ReminderError(WORDS.failed);
  }
}

/** Hands the token to the server; again with the same token is fine (it re-registers). */
async function postToken(token: string): Promise<void> {
  const res = await send("POST", token);
  if (res.status === 401) throw new ReminderError(WORDS.notSignedIn);
  if (!res.ok) throw new ReminderError(WORDS.refused);
}

export async function storedToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORE_KEY);
  } catch {
    return null;
  }
}

async function forgetLocally(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY).catch(() => undefined);
}

/** Takes this device's token, hands it to the server and remembers it here. Permission must already be granted. */
export async function register(): Promise<string> {
  const token = await expoToken();
  await postToken(token);
  await SecureStore.setItemAsync(STORE_KEY, token).catch(() => undefined);
  return token;
}

/** Turning reminders off here: the server lets go of the token, then the device forgets it. Throws when the server could not be told. */
export async function unregister(): Promise<void> {
  const token = await storedToken();
  if (token) {
    const res = await send("DELETE", token).catch(() => null);
    // Signed out already: the session's own end has nothing left to send to.
    if (!res || (!res.ok && res.status !== 401)) throw new ReminderError(WORDS.notOff);
  }
  await forgetLocally();
}

/** The launch re-registration: when reminders were turned on here and Android still allows them, the token is handed over again. */
export async function registerAgain(): Promise<void> {
  if (!pushAvailable()) return;
  const before = await storedToken();
  if (!before) return;
  if ((await readPermission()) !== "granted") return;
  try {
    await ensureChannel();
    await register();
  } catch {
    // Offline or refused: tried again at the next launch, as the web's own launch write is.
  }
}

/**
 * Sign-out's part (call it before the session goes): the server lets go of this device's token and the device
 * forgets it, so reminders for this account stop here. Never throws, and never holds sign-out up for long.
 */
export async function forgetReminders(waitMs = FORGET_WAIT_MS): Promise<void> {
  const token = await storedToken();
  if (token) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([send("DELETE", token).catch(() => null), new Promise((resolve) => (timer = setTimeout(resolve, waitMs)))]);
    clearTimeout(timer);
  }
  await forgetLocally();
}
