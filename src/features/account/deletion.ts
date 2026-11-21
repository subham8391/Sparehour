// Account deletion's shared rules and words (SYSTEM_DESIGN.md §9.6; ruled
// 2026-10-06), pure so the proxy, the routes and the pages share them and they
// are tested without a server.

/** What the auth user's app metadata carries while an account waits for deletion (set by account_delete_request). */
export interface DeletionMark {
  deletion_requested_at?: string;
  delete_after?: string;
}

/** The date an account waiting for deletion goes, or null when it is not waiting. */
export function deleteAfter(appMetadata: unknown): string | null {
  const v = (appMetadata as DeletionMark | null | undefined)?.delete_after;
  return typeof v === "string" && v ? v : null;
}

/** "Thursday 5 November 2026" for the day an account waiting for deletion goes; null when unreadable. */
export function deletionDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(at);
}

/** What deleting the account removes, said exactly (SCREENS.md §18 Account). */
export const DELETED_THINGS =
  "Every task, step, project, area and tag, your time blocks, day plans and settings, your reminders on every device, and your sign-in.";

/** The typed-confirmation sheet's own words (SCREENS.md §18 Account), said the same on the web and in the Android app. */
export const DELETE_ACCOUNT = {
  title: "Delete your account?",
  confirm: "Delete account",
  busy: "Deleting…",
  /** Under what goes: what else happens, and the 30 days. */
  after: "Connected calendars are disconnected and you’re signed out on every device at once. You have 30 days to change your mind: sign in before then and you can restore everything. After that it’s gone for good.",
  exportFirst: "Export your data first",
  exportNote: "A JSON file of everything, made on this device.",
  /** When the server's refusal comes without a sentence of its own. */
  failed: "Couldn’t delete your account just now. Nothing changed — try again.",
} as const;

/** The headline once an account waits for deletion: the day it goes, when that is known. */
export const deletedHeadline = (day: string | null): string => (day ? `Your account will be deleted on ${day}.` : "Your account is set to be deleted.");

/** Under that headline for someone signed out, straight after deleting. */
export const DELETED_SIGNED_OUT = "You’re signed out on every device. Changed your mind? Sign in before then and you can restore everything.";

/**
 * Asks the server to delete the account. Resolves the day it goes for good (ISO), or throws with a sentence to show.
 */
export async function requestAccountDeletion(fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "delete" }) });
  } catch {
    throw new Error("Couldn’t reach your account — deleting it needs a connection. Nothing changed.");
  }
  if (!res.ok) throw new Error("Couldn’t delete your account just now. Nothing changed — try again.");
  const body = (await res.json().catch(() => ({}))) as { delete_after?: string };
  return String(body.delete_after ?? "");
}
