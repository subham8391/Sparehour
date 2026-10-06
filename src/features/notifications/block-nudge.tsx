"use client";
// "Want a nudge when this starts?" (ONBOARDING.md, PRODUCT_SPEC.md §14 rule
// 7, SCREENS.md §19 inline banner): asked once, inline on Today, right after
// the first block is made on a device that can take reminders and has not
// been asked. Yes asks the browser from that tap and subscribes the way
// Settings does; Not now is remembered on this device and never asks again.
// A lazy island: it loads only when a block was just made.
import { useState } from "react";
import { useQuery } from "@/data/powersync";
import { Button, iconButtonClass } from "@/ui/button";
import { Icon } from "@/ui/icons";
import { BLOCK_NUDGE_KEY, closeBlockNudge } from "./block-nudge-store";
import type { PermissionState, PushPlatform } from "./push";
import { usePush } from "./use-push";

const NOTIFY_SQL = `select notify_block_start from user_settings limit 1`;

export interface NudgeInput {
  permission: PermissionState;
  platform: Pick<PushPlatform, "isIOS" | "standalone">;
  /** A service worker is registered here, so a subscription can exist. */
  workerAvailable: boolean;
  /** Settings › Notifications "A time block is starting"; on until the column has synced. */
  notifyBlockStart: boolean;
  /** "Not now" was chosen on this device before. */
  dismissed: boolean;
}

/** Ask only where the answer is still open and a yes would actually bring the reminder. */
export function nudgeEligible(i: NudgeInput): boolean {
  if (i.permission !== "default") return false; // granted, denied or no push here
  if (i.platform.isIOS && !i.platform.standalone) return false; // iOS gives push to Home Screen apps only
  return i.workerAvailable && i.notifyBlockStart && !i.dismissed;
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(BLOCK_NUDGE_KEY) === "dismissed";
  } catch {
    return false;
  }
}

export default function BlockNudge() {
  const push = usePush();
  const { data } = useQuery<{ notify_block_start: number | null }>(NOTIFY_SQL);
  const [asking, setAsking] = useState(false);
  const notifyBlockStart = (data?.[0]?.notify_block_start ?? 1) === 1;
  const eligible = nudgeEligible({ permission: push.permission, platform: push.platform, workerAvailable: push.workerAvailable, notifyBlockStart, dismissed: readDismissed() });

  if (push.error) {
    return (
      <p role="alert" className="flex items-center gap-1 rounded-xl border border-line bg-surface py-1 pr-1 pl-4 text-body-sm text-deadline">
        <span className="min-w-0 flex-1 text-pretty">{push.error}</span>
        <button type="button" aria-label="Dismiss" onClick={closeBlockNudge} className={iconButtonClass({ size: "compact" })}>
          <Icon name="close" size={14} />
        </button>
      </p>
    );
  }
  if (!eligible && !asking) return null;

  const yes = async () => {
    setAsking(true);
    // `enable` asks the browser before its first await, so the request belongs to this tap.
    await push.enable();
    setAsking(false);
    if (typeof Notification === "undefined" || Notification.permission !== "default") closeBlockNudge();
  };
  const notNow = () => {
    try {
      localStorage.setItem(BLOCK_NUDGE_KEY, "dismissed");
    } catch {
      // without storage the ask simply may come back on a later visit
    }
    closeBlockNudge();
  };

  return (
    <p role="status" className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface py-1 pr-1 pl-4 text-body-sm text-ink-2">
      <span className="min-w-0 flex-1 text-pretty">Want a nudge when this starts?</span>
      <span className="flex items-center gap-1">
        <Button variant="link" size="compact" onClick={() => void yes()} disabled={asking}>
          Yes
        </Button>
        <Button variant="link" size="compact" className="text-ink-2" onClick={notNow} disabled={asking}>
          Not now
        </Button>
      </span>
    </p>
  );
}
