// The "Reminders on this device" row's words on the phone (SCREENS.md §18 "permission status, honestly stated"). They
// are the web's own (../../../src/features/notifications/push.ts, `permissionCopy`), read for an installed Android
// app; only the sentences that are about a browser are said the phone's way:
//  - blocked: "Blocked in your browser." → "Blocked in Android's settings.", and the steps are Android's own;
//  - not asked yet: "Your browser will ask once." → "Android will ask once.";
//  - not available: the web's build without a service worker is, on the phone, Expo Go (no remote push since SDK 53);
//  - unsupported: "This browser can't show reminders." → "This phone can't show reminders." (shown when Android
//    gives no answer about the permission at all).
// Pure.
import { permissionCopy, type PermissionCopy, type PermissionState, type PushPlatform } from "@/features/notifications/push";

/** The installed Android app, as the web's rules see a platform: on a touch screen, outside any browser. */
const ANDROID_APP: PushPlatform = { isIOS: false, isSafari: false, isFirefox: false, standalone: true, touch: true, ua: "Android" };

export const BLOCKED_HEADLINE = "Blocked in Android's settings.";
/** Android's own way, said as the web says iOS's ("Open Settings → Notifications → Sparehour", "Allow notifications"). */
export const BLOCKED_STEPS = ["Open Settings → Apps → Sparehour → Notifications", "Allow notifications"];
export const CANT_SHOW = "This phone can't show reminders.";
export const ASKS_ONCE = "Android will ask once.";
export const NOT_IN_EXPO_GO = "They need the installed app; Expo Go can't receive them.";
/** The button that opens Android's own settings for the app when reminders are blocked. */
export const OPEN_SETTINGS = "Open Android settings";

/**
 * @param state what Android says ("denied" only once it will not ask again; until then it is "default").
 * @param registered this device turned reminders on and its address was taken by the server.
 * @param available the build can receive pushes (not Expo Go).
 */
export function reminderCopy(state: PermissionState, registered: boolean, available: boolean): PermissionCopy {
  const web = permissionCopy(state, ANDROID_APP, registered, available);
  if (state === "denied") return { ...web, headline: BLOCKED_HEADLINE, steps: BLOCKED_STEPS };
  if (state === "unsupported") return { ...web, headline: CANT_SHOW };
  if (!available) return { ...web, detail: NOT_IN_EXPO_GO };
  if (state === "default") return { ...web, detail: ASKS_ONCE };
  return web;
}
