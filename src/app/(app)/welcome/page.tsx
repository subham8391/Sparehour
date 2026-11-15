"use client";
// The first run (ONBOARDING.md 1b, step 2 and step 3; DECISIONS.md "Minimal first run" and the 2026-11-14
// amendment): a new account confirms its working hours and time zone, is offered its calendar (the number is a guess
// without the meetings), then empties its head into today, and lands on Today. The shell's gate sends an account here
// until it is done (features/shell/first-run-gate.tsx); "I'll add things later" is the way past. Confirmed hours and
// an answered calendar step are remembered on the device, so a reload or a reopen comes back to where it was. The
// calendar step shows only where this server can connect a calendar (Google, Outlook, or both: DECISIONS.md,
// amendment 2026-11-15) and nothing is connected yet; the consent leaves the page and comes back with `?calendar=…`.
// The brain dump carries the parser and is fetched in idle time while the hours are on screen; the calendar step is
// fetched the same way, once the server has said there is a calendar to offer.
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { WORK_HOURS_SQL } from "@/data/queries/today";
import { SettingsRepo, WorkHoursRepo } from "@/data/repositories/settings-repo";
import type { WorkHoursRow } from "@/data/schema.client";
import { usePwaOptional } from "@/features/pwa/pwa-provider";
import { canonicalZone, segmentsLabel } from "@/features/settings/settings-rules";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useUndoSink } from "@/features/undo/undo-provider";
import { valueEntry } from "@/features/undo/value-entry";
import type { CalendarOutcome } from "@/features/welcome/calendar-step";
import { HoursStep } from "@/features/welcome/hours-step";
import { calendarAnsweredHere, forgetFirstRun, hoursConfirmedHere, rememberCalendarAnswered, rememberHoursConfirmed } from "@/features/welcome/step-memory";
import { detectedZone, weekFromRows, type Segment } from "@/features/welcome/welcome-rules";
import { LOADING_LINE, Loading } from "../loading-view";

const SETTINGS_ROW_SQL = `select id, onboarded_at, timezone from user_settings limit 1`;
const USER_SQL = `select id, personal_space_id from users limit 1`;
const CONNECTIONS_SQL = `select count(*) as n from calendar_connections where deleted_at is null`;
/** How long the calendar step waits to learn which calendars this server can connect before it steps aside. */
const CONFIG_WAIT_MS = 4000;

/** What the consent came back with, read once from `?calendar=…&reason=…` (api/calendar/{google,microsoft}/callback). */
function returnedFromConsent(): { outcome: string | null; reason: string | null } {
  if (typeof window === "undefined") return { outcome: null, reason: null };
  const q = new URLSearchParams(window.location.search);
  return { outcome: q.get("calendar"), reason: q.get("reason") };
}

interface Connectable {
  google: boolean;
  microsoft: boolean;
}
const NONE: Connectable = { google: false, microsoft: false };

/** Which calendars this server can connect: null until it answers; no answer in time reads as none. */
function useConnectable(): Connectable | null {
  const [can, setCan] = useState<Connectable | null>(null);
  useEffect(() => {
    let live = true;
    const stop = new AbortController();
    const timer = window.setTimeout(() => stop.abort(), CONFIG_WAIT_MS);
    fetch("/api/calendar/config", { credentials: "include", cache: "no-store", signal: stop.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ google?: boolean; microsoft?: boolean }>) : {}))
      .then(
        (body: { google?: boolean; microsoft?: boolean }) => live && setCan({ google: body.google === true, microsoft: body.microsoft === true }),
        () => live && setCan(NONE),
      )
      .finally(() => window.clearTimeout(timer));
    return () => {
      live = false;
      window.clearTimeout(timer);
      stop.abort();
    };
  }, []);
  return can;
}

const loadCalendarStep = () => import("@/features/welcome/calendar-step");
const CalendarStep = dynamic(() => loadCalendarStep().then((m) => m.CalendarStep), {
  ssr: false,
  loading: () => <Loading />,
});

const loadBrainDump = () => import("@/features/welcome/brain-dump");
const BrainDump = dynamic(() => loadBrainDump().then((m) => m.BrainDump), {
  ssr: false,
  loading: () => <p className={LOADING_LINE}>Opening…</p>,
});

const reason = (e: unknown) => (e instanceof Error && e.message ? e.message : "try again.");

export default function WelcomePage() {
  const router = useRouter();
  const db = useLocalDatabase();
  const settingsRepo = useMemo(() => new SettingsRepo(db), [db]);
  const hoursRepo = useMemo(() => new WorkHoursRepo(db), [db]);
  const undo = useUndoSink();
  const pwa = usePwaOptional();
  const now = useNow();
  const { today, zone: accountZone, settings } = useLocalDay(now);
  const { data: rows } = useQuery<{ id: string; onboarded_at: string | null; timezone: string | null }>(SETTINGS_ROW_SQL);
  const { data: users } = useQuery<{ id: string; personal_space_id: string | null }>(USER_SQL);
  const { data: hourRows, isLoading: hoursLoading } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const { data: connectionRows } = useQuery<{ n: number }>(CONNECTIONS_SQL);
  const can = useConnectable();
  const offered = can !== null && (can.google || can.microsoft);
  const [returned] = useState(returnedFromConsent);
  const [calendarAnswered, setCalendarAnswered] = useState(false);
  const row = rows?.[0];
  const user = users?.[0];
  const spaceId = user?.personal_space_id;
  const saved = useMemo(() => weekFromRows(hourRows ?? []), [hourRows]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const done = Boolean(row?.onboarded_at);

  useEffect(() => preloadOnIdle(loadBrainDump), []);
  // The calendar step is fetched only where there is a calendar to offer, while the hours are still on screen.
  useEffect(() => (offered ? preloadOnIdle(loadCalendarStep) : undefined), [offered]);
  // The consent's answer is read once; the address goes back to plain /welcome so a reload does not say it again.
  useEffect(() => {
    if (returned.outcome) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [returned.outcome]);
  // A connection just made is remembered at once: its row reaches this device a moment later, and a reload in
  // between must not offer the calendar again.
  const userId = users?.[0]?.id;
  useEffect(() => {
    if (userId && returned.outcome === "connected") rememberCalendarAnswered(userId);
  }, [userId, returned.outcome]);
  // Already set up (finished on another device, or opened by hand): there is nothing to do here.
  useEffect(() => {
    if (done) router.replace("/today");
  }, [done, router]);

  if (!row || !user || !spaceId || hoursLoading || done) return <Loading />;

  const hoursDone = confirmed || hoursConfirmedHere(user.id);
  // The calendar is settled once it is connected (the row has synced, or the consent just said so), the person
  // skipped it, or this server cannot connect one at all.
  const connected = Number(connectionRows?.[0]?.n ?? 0) > 0 || returned.outcome === "connected";
  const calendarSettled = calendarAnswered || calendarAnsweredHere(user.id) || connected || returned.outcome === "unavailable" || (can !== null && !offered);
  const refused: CalendarOutcome | null = returned.outcome === "denied" || returned.outcome === "error" || returned.outcome === "no_read" ? returned.outcome : null;

  // "That's right": the zone the times are in and the week as shown, written only where they differ from what is
  // saved; one ⌘Z puts both back.
  const confirmHours = async (week: Segment[][], zone: string) => {
    const ctx = { spaceId, userId: user.id };
    const before = { zone: row.timezone ?? "UTC", week: saved };
    const write = async (z: string, w: readonly (readonly Segment[])[], from: { zone: string; week: readonly (readonly Segment[])[] }) => {
      if (z !== from.zone) await settingsRepo.update(row.id, { timezone: z });
      for (let d = 0; d < 7; d++) if (segmentsLabel(w[d]) !== segmentsLabel(from.week[d])) await hoursRepo.replaceDay(d, w[d], ctx);
    };
    setBusy(true);
    setFailure(null);
    try {
      await write(zone, week, before);
      undo?.record(valueEntry("Set your working hours", (to: typeof before, from: typeof before) => write(to.zone, to.week, from), before, { zone, week }));
      rememberHoursConfirmed(user.id);
      setConfirmed(true);
    } catch (e) {
      setFailure(`Couldn't save your hours: ${reason(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // "Next — N things" and "I'll add things later" both end the first run on Today (steps 4–5 are M2).
  const finish = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await settingsRepo.finishFirstRun(row.id);
      forgetFirstRun();
      // The end of the first run is the moment to ask the browser to keep our storage (PRODUCT_SPEC.md §19 rule 2).
      pwa?.requestPersist();
      router.replace("/today");
    } catch (e) {
      setFailure(`Couldn't finish: ${reason(e)}`);
      setBusy(false);
    }
  };

  if (!hoursDone) {
    return <HoursStep saved={saved} zone={canonicalZone(detectedZone() ?? row.timezone ?? "UTC")} onConfirm={(w, z) => void confirmHours(w, z)} busy={busy} failure={failure} />;
  }
  if (!calendarSettled) {
    // The hours are saved and the server has not yet said whether it can connect a calendar: one quiet beat.
    if (can === null) return <Loading />;
    return (
      <CalendarStep
        google={can.google}
        outlook={can.microsoft}
        outcome={refused}
        reason={returned.reason}
        onSkip={() => {
          rememberCalendarAnswered(user.id);
          setCalendarAnswered(true);
        }}
      />
    );
  }
  return <BrainDump ctx={{ now, zone: accountZone, today, eveningStartsAt: settings?.eveningStartsAt }} spaceId={spaceId} onFinish={() => void finish()} busy={busy} failure={failure} />;
}
