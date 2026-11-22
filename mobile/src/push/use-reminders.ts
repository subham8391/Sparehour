// "Reminders on this device" for Settings › Notifications (the web's features/notifications/use-push.ts, the phone's
// way): Android's permission, whether this device turned reminders on, busy and error, and the two things to do.
// Turning on makes the channel, asks Android (Android 13 and later show the system box), takes the token and hands it
// to the server; turning off has the server let go of it. The permission is read again whenever the app comes back to
// the front, so coming back from Android's settings after lifting a block shows the new state at once.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import type { PermissionCopy, PermissionState } from "@/features/notifications/push";
import { reminderCopy } from "./copy";
import { ReminderError, ensureChannel, pushAvailable, readPermission, register, requestPermission, storedToken, unregister } from "./device";

export interface RemindersApi {
  /** Android's answer and the device's memory have been read (a moment after a mount). */
  ready: boolean;
  permission: PermissionState;
  /** This device turned reminders on (and the server took its token). */
  registered: boolean;
  busy: boolean;
  error: string | null;
  copy: PermissionCopy;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

const words = (e: unknown, fallback: string) => (e instanceof ReminderError ? e.message : fallback);

export function useReminders(): RemindersApi {
  const [ready, setReady] = useState(false);
  const [permission, setPermission] = useState<PermissionState>("default");
  const [registered, setRegistered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const available = useMemo(() => pushAvailable(), []);

  useEffect(() => {
    let live = true;
    const read = () =>
      void Promise.all([readPermission(), storedToken()]).then(([p, token]) => {
        if (!live) return;
        setPermission(p);
        setRegistered(token !== null);
        setReady(true);
      });
    read();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureChannel();
      const result = await requestPermission();
      setPermission(result);
      if (result !== "granted") return;
      await register();
      setRegistered(true);
    } catch (e) {
      setError(words(e, "Couldn’t turn reminders on just now. Try again."));
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await unregister();
      setRegistered(false);
    } catch (e) {
      setError(words(e, "Couldn’t turn reminders off just now. Try again."));
    } finally {
      setBusy(false);
    }
  }, []);

  const copy = useMemo(() => reminderCopy(permission, registered, available), [permission, registered, available]);
  return useMemo(() => ({ ready, permission, registered, busy, error, copy, enable, disable }), [ready, permission, registered, busy, error, copy, enable, disable]);
}
