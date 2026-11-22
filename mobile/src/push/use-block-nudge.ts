// "Want a nudge when this starts?" on the phone (the web's features/notifications/block-nudge.tsx; ONBOARDING.md,
// PRODUCT_SPEC.md §14 rule 7): asked once, on Today, right after the first block is made here, on a phone whose
// reminders are not on yet. The moment comes from the shared store (block-nudge-store.ts, noted by BlockWrites); who
// is asked is the shared `nudgeEligible`. Yes turns reminders on the way Settings does (Android asks from that tap);
// Not now is remembered on this phone and never asks again.
//
// One difference from the browser, in what "still open" means: Android before 13 grants notifications without
// asking, so a phone is asked while its reminders are not turned on here, unless Android has blocked them.
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { useQuery } from "@/data/powersync";
import { BLOCK_NUDGE_KEY, closeBlockNudge, nudgeEligible, useBlockNudgePending } from "@/features/notifications/block-nudge-store";
import type { PermissionState } from "@/features/notifications/push";
import { pushAvailable, readPermission, storedToken } from "./device";
import { useReminders } from "./use-reminders";

const NOTIFY_SQL = `select notify_block_start from user_settings limit 1`;
/** SecureStore keys take letters, digits, ".", "-" and "_": the web's own key fits. */
const DISMISSED = "dismissed";

export interface BlockNudgeLine {
  /** Turning on failed: the reason, with a way to put the line away. */
  error: string | null;
  asking: boolean;
  onYes: () => void;
  onNotNow: () => void;
  onClose: () => void;
}

/** The permission as the shared rule reads it: open while this phone's reminders are off and Android has not blocked them. */
export function openAnswer(permission: PermissionState, registered: boolean): PermissionState {
  if (registered) return "granted";
  return permission === "granted" ? "default" : permission;
}

/** The line to draw on Today, or null. Mounted with Today; does nothing until a block was just made here. */
export function useBlockNudge(): BlockNudgeLine | null {
  const pending = useBlockNudgePending();
  const reminders = useReminders();
  const { data } = useQuery<{ notify_block_start: number | null }>(NOTIFY_SQL);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!pending) return;
    let live = true;
    void SecureStore.getItemAsync(BLOCK_NUDGE_KEY)
      .then((v) => live && setDismissed(v === DISMISSED))
      .catch(() => live && setDismissed(false));
    return () => {
      live = false;
    };
  }, [pending]);

  if (!pending || !reminders.ready || dismissed === null) return null;

  if (reminders.error) return { error: reminders.error, asking: false, onYes: () => {}, onNotNow: () => {}, onClose: closeBlockNudge };

  const eligible = nudgeEligible({
    permission: openAnswer(reminders.permission, reminders.registered),
    platform: { isIOS: false, standalone: true },
    workerAvailable: pushAvailable(),
    notifyBlockStart: (data?.[0]?.notify_block_start ?? 1) === 1,
    dismissed,
  });
  if (!eligible && !asking) return null;

  return {
    error: null,
    asking,
    onYes: () => {
      setAsking(true);
      // As on the web: the line goes once Android has answered; a failure stays, in words, until put away.
      void reminders
        .enable()
        .then(async () => {
          const [permission, token] = await Promise.all([readPermission(), storedToken()]);
          if (token !== null || permission === "denied") closeBlockNudge();
        })
        .finally(() => setAsking(false));
    },
    onNotNow: () => {
      void SecureStore.setItemAsync(BLOCK_NUDGE_KEY, DISMISSED).catch(() => undefined);
      closeBlockNudge();
    },
    onClose: closeBlockNudge,
  };
}
