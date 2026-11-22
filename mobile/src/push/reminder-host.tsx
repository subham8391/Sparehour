// The reminders' host on the phone, mounted once under the app's providers beside the screens (app/_layout.tsx), as
// the web's shell mounts its deep-link handler (features/notifications/push-deep-link.tsx). It:
//  - shows a reminder that arrives while the app is open (the system's banner and list, its sound unless silent);
//  - gives each kind of reminder its buttons: one notification category per kind, the buttons the web's service
//    worker shows (actions.ts `actionsFor`, the action ids as the buttons' identifiers), each opening the app;
//  - hands this device's token to the server again on every launch when reminders were turned on here (device.ts);
//  - carries out a tapped reminder as the web's push-actions.tsx does: the reminder's page opens, then a button's
//    action is done at once (start opens the task, snooze moves the block 15 minutes, today / tomorrow move the task,
//    plan and shutdown open those screens, dismiss does nothing), and a plain tap opens the same action sheet. What
//    each action writes is shared with the web (push-action-rules.ts); the writes record their own undo, which the
//    app's one toast offers.
// It draws only that sheet.
import { useRootNavigationState, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalDatabase } from "@/data/powersync";
import { useBlockRepo } from "@/features/blocking/use-block-repo";
import { actionsFor, type PushAction, type PushKind } from "@/features/notifications/actions";
import type { DeepLink } from "@/features/notifications/push";
import { SHEET_TITLES, carryOutPushAction } from "@/features/notifications/push-action-rules";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useTaskRepo } from "@/features/tasks/use-task-repo";
import { registerAgain } from "./device";
import { ReminderSheet } from "./reminder-sheet";
import { readResponse } from "./response";

/** Every kind of reminder there is: the kinds the sheet has a title for. */
export const KINDS = Object.keys(SHEET_TITLES) as PushKind[];

/** While the app is open a reminder is shown anyway: banner and list, its sound unless it came silent. */
export const SHOW_WHILE_OPEN: Notifications.NotificationHandler = {
  handleNotification: async (n) => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: Boolean(n.request.content.sound), shouldSetBadge: true }),
};

/** One category per kind, its buttons the web's (`categoryId` on each push is the kind). */
export async function registerCategories(): Promise<void> {
  await Promise.all(
    KINDS.map((kind) =>
      Notifications.setNotificationCategoryAsync(
        kind,
        actionsFor(kind).map((a) => ({ identifier: a.id, buttonTitle: a.label, options: { opensAppToForeground: true } })),
      ),
    ),
  );
}

export function ReminderHost() {
  const router = useRouter();
  const mounted = Boolean(useRootNavigationState()?.key);
  const db = useLocalDatabase();
  const tasks = useTaskRepo();
  const blocks = useBlockRepo();
  const now = useNow();
  // The person's own today (zone and rollover hour): a tap waits the moment it takes to read.
  const { today, ready } = useLocalDay(now);
  const response = Notifications.useLastNotificationResponse();
  const [sheet, setSheet] = useState<DeepLink | null>(null);
  const done = useRef<string | null>(null);

  useEffect(() => {
    Notifications.setNotificationHandler(SHOW_WHILE_OPEN);
    void registerCategories().catch(() => undefined);
    void registerAgain();
  }, []);

  const run = useCallback(
    (link: DeepLink, action: PushAction) =>
      carryOutPushAction(link, action, {
        db,
        tasks,
        blocks,
        today,
        openTask: (id) => router.push(`/task/${id}`),
        go: (page) => router.push(page),
      }).catch(() => undefined),
    [db, tasks, blocks, today, router],
  );

  useEffect(() => {
    if (!mounted || !ready || !response) return;
    const tap = readResponse(response);
    if (!tap || done.current === tap.key) return;
    done.current = tap.key;
    // Read once: a later mount (a sign-in again, say) does not carry it out a second time.
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    // Gone from the tray once acted on, as the web's worker closes it on any click.
    void Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
    // The reminder's own page first, as the web's service worker opens it; then the button, or the sheet.
    router.navigate(tap.page);
    if (tap.link.action) void run(tap.link, tap.link.action);
    else setSheet(tap.link);
  }, [mounted, ready, response, run, router]);

  return (
    <ReminderSheet
      link={sheet}
      onPick={(a) => {
        const link = sheet;
        setSheet(null);
        if (link) void run(link, a);
      }}
      onClose={() => setSheet(null)}
    />
  );
}
