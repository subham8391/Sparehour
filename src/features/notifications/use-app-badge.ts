"use client";
// The app-icon badge (PRODUCT_SPEC.md §14 rule 6, SCREENS.md §19): today's
// remaining planned count, neutral, never a count of what is late. Only once
// notifications were allowed; off when Settings › Notifications says so; 0
// from the evening shutdown until the day rolls over. Pushes carry the same
// number (`app_badge`, computed on the server at send time) so a closed app
// stays right.
import { useEffect } from "react";
import { useQuery } from "@/data/powersync";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";

const BADGE_SQL = `
  select s.badge_enabled as enabled,
         (select p.shutdown_at from day_plans p where p.deleted_at is null and p.date = ? and p.shutdown_at is not null limit 1) as shutdown_at
  from user_settings s limit 1`;

export interface BadgeState {
  /** Today's remaining count, with the sidebar's Today predicate (carried-over included). */
  count: number;
  /** Settings › Notifications "Badge on the app icon"; on until the column has synced. */
  enabled: boolean;
  /** Today's day plan has been shut down. */
  shutDown: boolean;
  permission: NotificationPermission | "unsupported";
}

/** What the icon should show: a number (0 clears it), or null to leave it alone before permission is granted. */
export function badgeCount(s: BadgeState): number | null {
  if (s.permission !== "granted") return null;
  if (!s.enabled || s.shutDown) return 0;
  return Math.max(0, s.count);
}

type BadgeNavigator = Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

export function useAppBadge(count: number): void {
  const now = useNow();
  const { today } = useLocalDay(now);
  const { data } = useQuery<{ enabled: number | null; shutdown_at: string | null }>(BADGE_SQL, [today.toString()]);
  const row = data?.[0];
  const enabled = row?.enabled !== 0;
  const shutDown = Boolean(row?.shutdown_at);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
    const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
    const n = badgeCount({ count, enabled, shutDown, permission });
    if (n === null) return;
    const nav = navigator as BadgeNavigator;
    void (n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {});
  }, [count, enabled, shutDown]);
}
