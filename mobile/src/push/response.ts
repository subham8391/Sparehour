// What a tap on a reminder asks for (SYSTEM_DESIGN.md §7.1, §7.3). The web's service worker opens the reminder's own
// page (`data.navigate`, with `?action=<button>` added when a button was pressed) and the page then reads it with
// `parseDeepLink`; the phone reads the same address the same way, with the same helpers
// (../../../src/features/notifications/actions.ts `withAction`, push.ts `parseDeepLink`), and names the page the
// phone's way (share/opening.ts: the web's Today is the first tab here). Pure.
import { DEFAULT_ACTION_IDENTIFIER } from "expo-notifications";
import { isPushAction, withAction } from "@/features/notifications/actions";
import { parseDeepLink, type DeepLink } from "@/features/notifications/push";
import { opening } from "~/share/opening";

/** The parts of a notification response this reads. */
export interface ResponseLike {
  actionIdentifier: string;
  notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } };
}

export interface ReminderTap {
  link: DeepLink;
  /** The phone's page the reminder opens on, as the web's opens on its `navigate` page. */
  page: string;
  /** Tells one response from another, so each is carried out once however often it is read. */
  key: string;
}

/** `/today?src=push&…` → `/`, `/plan?src=push&kind=morning` → `/plan`: the phone's page, without the query. */
export function phonePage(navigate: string): string {
  const to = opening(navigate.split("?")[0] || "/", () => "").to;
  return to.split("?")[0] || "/";
}

/** The deep link and page of a tapped reminder; null for a notification that is not one of Sparehour's reminders. */
export function readResponse(response: ResponseLike): ReminderTap | null {
  const data = response.notification.request.content.data ?? {};
  const navigate = typeof data.navigate === "string" ? data.navigate : null;
  if (!navigate) return null;
  const button = response.actionIdentifier !== DEFAULT_ACTION_IDENTIFIER && isPushAction(response.actionIdentifier) ? response.actionIdentifier : null;
  const address = withAction(navigate, button);
  const query = address.includes("?") ? address.slice(address.indexOf("?") + 1) : "";
  const link = parseDeepLink(new URLSearchParams(query));
  if (!link) return null;
  return { link, page: phonePage(navigate), key: `${response.notification.request.identifier}:${response.actionIdentifier}` };
}
