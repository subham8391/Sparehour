// The app-icon badge on the phone (the web's features/notifications/use-app-badge.ts; PRODUCT_SPEC.md §14 rule 6):
// today's remaining planned count, never a count of what is late; 0 once the day is shut down or when Settings ›
// Notifications turns the badge off; left alone until notifications are allowed. Each reminder carries the same
// number (`app_badge`), so a closed app is right after one; this keeps it right while the app is open, the moment
// a task is planned or finished. The count is the tab bar's (data/queries/nav.ts), the rule the web's `badgeCount`.
// Draws nothing.
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useQuery } from "@/data/powersync";
import { TODAY_COUNT_SQL } from "@/data/queries/nav";
import type { PermissionState } from "@/features/notifications/push";
import { BADGE_SQL, badgeCount } from "@/features/notifications/use-app-badge";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { readPermission } from "./device";

export function AppBadge() {
  const now = useNow();
  const { today } = useLocalDay(now);
  const iso = today.toString();
  const { data: counted } = useQuery<{ n: number }>(TODAY_COUNT_SQL, [iso, iso]);
  const { data: settings } = useQuery<{ enabled: number | null; shutdown_at: string | null }>(BADGE_SQL, [iso]);
  const [permission, setPermission] = useState<PermissionState>("default");

  // Allowing notifications (Settings, the first-block ask, or Android's own settings) shows the badge on coming back.
  useEffect(() => {
    let live = true;
    const read = () => void readPermission().then((p) => live && setPermission(p));
    read();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  const row = settings?.[0];
  const n = badgeCount({
    count: counted?.[0]?.n ?? 0,
    enabled: row?.enabled !== 0,
    shutDown: Boolean(row?.shutdown_at),
    // The web's rule reads the browser's word for it; "default" and "unsupported" both leave the badge alone.
    permission: permission === "granted" ? "granted" : "default",
  });

  useEffect(() => {
    if (n === null) return;
    void Notifications.setBadgeCountAsync(n).catch(() => undefined);
  }, [n]);

  return null;
}
