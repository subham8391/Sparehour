// What a notification can do (SCREENS.md §19, SYSTEM_DESIGN.md §7.1). Shared
// by the service worker (buttons where the platform has them) and the app
// (the action sheet where it does not). No DOM, no React: the worker
// bundle imports this file directly.

export type PushKind = "block_start" | "deadline_eve" | "deadline_day" | "morning" | "shutdown";
export type PushAction = "start" | "snooze" | "plan" | "today" | "tomorrow" | "dismiss" | "shutdown";

export const ACTION_LABELS: Record<PushAction, string> = {
  start: "Start",
  snooze: "Snooze 15m",
  plan: "Plan",
  today: "Today",
  tomorrow: "Tomorrow",
  dismiss: "Not today",
  shutdown: "Shutdown",
};

const KINDS: readonly PushKind[] = ["block_start", "deadline_eve", "deadline_day", "morning", "shutdown"];
const ACTIONS: readonly PushAction[] = ["start", "snooze", "plan", "today", "tomorrow", "dismiss", "shutdown"];

export const isPushKind = (v: unknown): v is PushKind => typeof v === "string" && (KINDS as readonly string[]).includes(v);
export const isPushAction = (v: unknown): v is PushAction => typeof v === "string" && (ACTIONS as readonly string[]).includes(v);

/** The choices a kind offers, in order; the same three everywhere the platform allows. */
export function actionsFor(kind: PushKind): { id: PushAction; label: string }[] {
  const ids: PushAction[] = kind === "block_start" ? ["start", "snooze", "plan"] : kind === "deadline_eve" ? ["today", "tomorrow", "plan"] : kind === "deadline_day" ? ["today", "plan"] : kind === "morning" ? ["plan", "dismiss"] : ["shutdown", "dismiss"];
  return ids.map((id) => ({ id, label: ACTION_LABELS[id] }));
}

/** Safari and every iOS browser show notifications without buttons (§7.3). */
export function supportsActions(userAgent: string): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return false;
  const safari = /Safari/.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox/.test(userAgent);
  return !safari;
}

/** `?action=…` appended to a deep link when a button was pressed. */
export function withAction(navigate: string, action: string | null | undefined): string {
  if (!action) return navigate;
  return `${navigate}${navigate.includes("?") ? "&" : "?"}action=${encodeURIComponent(action)}`;
}
