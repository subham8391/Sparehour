// The first run on the phone, at /welcome (ONBOARDING.md 1b, step 2 and step 3; DECISIONS.md "Minimal first run" and
// the 2026-11-14 amendment; the web's is app/(app)/welcome/page.tsx), wired to the phone's own database. A new account
// confirms its working hours and time zone, is offered its calendar (the number is a guess without the meetings), then
// empties its head into today, and lands on Today. The start gate sends an account here until it is done
// (screens/start/start-gate.tsx); "I'll add things later" is the way past. Confirmed hours and an answered calendar
// step are remembered on the phone, so closing the app comes back to where it was. The calendar step shows only where
// a calendar can be connected (Google, Outlook, or both) and nothing is connected yet. Which step is on, what "That's
// right" writes and what ends the run are the web's own (features/welcome/first-run-data.ts, welcome-rules.ts; the
// stamp is SettingsRepo.finishFirstRun). The drawing is the *-view.tsx beside this file.
//
// The web answers ⌘Z for "That's right" with a silent undo entry. A phone has no ⌘Z, so none is recorded
// (settings/use-settings.ts has the same rule): the hours are changed back in Settings › Working hours.
import { openURL } from "expo-linking";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalDatabase, useQuery, type LocalDatabase } from "@/data/powersync";
import { WORK_HOURS_SQL } from "@/data/queries/today";
import { SettingsRepo, WorkHoursRepo } from "@/data/repositories/settings-repo";
import type { WorkHoursRow } from "@/data/schema.client";
import { canonicalZone } from "@/features/settings/settings-rules";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { CONFIG_WAIT_MS, CONNECTIONS_SQL, NONE, SETTINGS_ROW_SQL, USER_SQL, calendarSettled, refusalOf, writeHours, type Connectable } from "@/features/welcome/first-run-data";
import { detectedZone, weekFromRows, type Segment } from "@/features/welcome/welcome-rules";
import { OPENING, couldNotFinish, couldNotSaveHours } from "@/features/welcome/welcome-words";
import { useCalendarConnect, type CalendarProvider, type ConnectOutcome } from "~/calendar/connect";
import { config } from "~/config";
import { HOME } from "~/screens/start/start-rule";
import { BrainDump } from "./brain-dump";
import { CalendarStepView } from "./calendar-step-view";
import { HoursStepView } from "./hours-step-view";
import { useStepMemory } from "./use-step-memory";
import { WelcomeOpening } from "./welcome-frame";

/** What a connect came back with, in the words the web's consent comes back with (the callbacks under api/calendar). */
const AS_CONSENT: Record<ConnectOutcome, string> = { connected: "connected", cancelled: "denied", failed: "error", unavailable: "unavailable" };

/**
 * Which calendars can be connected: null until that is known; when it is still not known after the web's own wait,
 * it reads as none, and the step steps aside.
 */
function useConnectable(available: Connectable | null): Connectable | null {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLate(true), CONFIG_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  return available ?? (late ? NONE : null);
}

export function Welcome() {
  const router = useRouter();
  const db = useLocalDatabase() as LocalDatabase;
  const settingsRepo = useMemo(() => new SettingsRepo(db), [db]);
  const hoursRepo = useMemo(() => new WorkHoursRepo(db), [db]);
  const now = useNow();
  const { today, zone: accountZone, settings } = useLocalDay(now);
  const { data: rows } = useQuery<{ id: string; onboarded_at: string | null; timezone: string | null }>(SETTINGS_ROW_SQL);
  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const { data: hourRows, isLoading: hoursLoading } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const { data: connectionRows } = useQuery<{ n: number }>(CONNECTIONS_SQL);
  const calendar = useCalendarConnect();
  const can = useConnectable(calendar.available);
  const row = rows?.[0];
  const user = users?.[0];
  const spaceId = user?.personal_space_id;
  const memory = useStepMemory(user?.id);
  const saved = useMemo(() => weekFromRows(hourRows ?? []), [hourRows]);
  const [confirmed, setConfirmed] = useState(false);
  const [calendarAnswered, setCalendarAnswered] = useState(false);
  /** What the last connect came back with, as the web's consent would say it. */
  const [outcome, setOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const done = Boolean(row?.onboarded_at);

  // On to Today, once: the end of the run and the stamped row arriving a moment later are the same leaving.
  const gone = useRef(false);
  const leave = useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    router.replace(HOME);
  }, [router]);
  // Already set up (finished on another device, or opened by hand): there is nothing to do here.
  useEffect(() => {
    if (done) leave();
  }, [done, leave]);

  if (!row || !user || !spaceId || hoursLoading || done || !memory.read) return <WelcomeOpening line={OPENING} />;

  const hoursDone = confirmed || memory.hoursConfirmed;
  const settled = calendarSettled({ answered: calendarAnswered || memory.calendarAnswered, connections: Number(connectionRows?.[0]?.n ?? 0), outcome, can });

  // "That's right": the zone the times are in and the week as shown, written only where they differ from what is saved.
  const confirmHours = async (week: Segment[][], zone: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await writeHours({ settings: settingsRepo, hours: hoursRepo }, row.id, { spaceId, userId: user.id }, { zone, week }, { zone: row.timezone ?? "UTC", week: saved });
      memory.rememberHours();
      setConfirmed(true);
    } catch (e) {
      setFailure(couldNotSaveHours(e));
    } finally {
      setBusy(false);
    }
  };

  // The consent runs in the phone's browser and comes back to the app (~/calendar/connect). A connection is
  // remembered at once: its row reaches this phone a moment later, and reopening the app in between must not offer
  // the calendar again.
  const connect = async (provider: CalendarProvider) => {
    const came = await calendar.connect(provider).catch((): ConnectOutcome => "failed");
    if (came === "connected") memory.rememberCalendar();
    setOutcome(AS_CONSENT[came]);
  };

  // "Next — N things" and "I'll add things later" both end the first run on Today.
  const finish = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await settingsRepo.finishFirstRun(row.id);
      memory.forget();
      leave();
    } catch (e) {
      setFailure(couldNotFinish(e));
      setBusy(false);
    }
  };

  if (!hoursDone) {
    return <HoursStepView saved={saved} zone={canonicalZone(detectedZone() ?? row.timezone ?? "UTC")} onConfirm={(w, z) => void confirmHours(w, z)} busy={busy} failure={failure} />;
  }
  if (!settled) {
    // The hours are saved and it is not yet known whether a calendar can be connected: one quiet beat.
    if (can === null) return <WelcomeOpening line={OPENING} />;
    return (
      <CalendarStepView
        google={can.google}
        outlook={can.microsoft}
        outcome={refusalOf(outcome)}
        busy={calendar.busy}
        onSkip={() => {
          memory.rememberCalendar();
          setCalendarAnswered(true);
        }}
        onConnect={(provider) => void connect(provider)}
        onPrivacy={() => void openURL(`${config.appUrl}/privacy`).catch(() => undefined)}
      />
    );
  }
  return <BrainDump ctx={{ now, zone: accountZone, today, eveningStartsAt: settings?.eveningStartsAt }} spaceId={spaceId} defaultEstimateMin={settings?.defaultEstimateMin ?? 30} onFinish={() => void finish()} busy={busy} failure={failure} />;
}
