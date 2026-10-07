"use client";
// The first run (ONBOARDING.md 1b and step 3; M1 ships only these two, DECISIONS.md "Minimal first run"): a new
// account confirms its working hours and time zone, then empties its head into today, and lands on Today. The
// shell's gate sends an account here until it is done (features/shell/first-run-gate.tsx); "I'll add things later"
// is the way past. Confirmed hours are remembered on the device, so a reload or a reopen comes back to the brain
// dump. The brain dump carries the parser and is fetched in idle time while the hours are on screen.
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
import { HoursStep } from "@/features/welcome/hours-step";
import { forgetFirstRun, hoursConfirmedHere, rememberHoursConfirmed } from "@/features/welcome/step-memory";
import { detectedZone, weekFromRows, type Segment } from "@/features/welcome/welcome-rules";
import { LOADING_LINE, Loading } from "../loading-view";

const SETTINGS_ROW_SQL = `select id, onboarded_at, timezone from user_settings limit 1`;
const USER_SQL = `select id, personal_space_id from users limit 1`;

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
  const row = rows?.[0];
  const user = users?.[0];
  const spaceId = user?.personal_space_id;
  const saved = useMemo(() => weekFromRows(hourRows ?? []), [hourRows]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const done = Boolean(row?.onboarded_at);

  useEffect(() => preloadOnIdle(loadBrainDump), []);
  // Already set up (finished on another device, or opened by hand): there is nothing to do here.
  useEffect(() => {
    if (done) router.replace("/today");
  }, [done, router]);

  if (!row || !user || !spaceId || hoursLoading || done) return <Loading />;

  const atBrainDump = confirmed || hoursConfirmedHere(user.id);

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
      undo?.record({ label: "Set your working hours", toast: false, undo: () => write(before.zone, before.week, { zone, week }) });
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

  if (!atBrainDump) {
    return <HoursStep saved={saved} zone={canonicalZone(detectedZone() ?? row.timezone ?? "UTC")} onConfirm={(w, z) => void confirmHours(w, z)} busy={busy} failure={failure} />;
  }
  return <BrainDump ctx={{ now, zone: accountZone, today, eveningStartsAt: settings?.eveningStartsAt }} spaceId={spaceId} onFinish={() => void finish()} busy={busy} failure={failure} />;
}
