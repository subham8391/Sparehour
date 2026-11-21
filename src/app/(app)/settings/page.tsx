"use client";
// Settings (SCREENS.md §18): what the app knows about your day, editable in
// place, and the way out. A section list with the open section beside it from
// 900 px, a list that pushes into each section below it. The page owns the
// data, the writes and their undo; each section's controls are an island.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useUndoSink } from "@/features/undo/undo-provider";
import { valueEntry } from "@/features/undo/value-entry";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { SETTINGS_SQL, WORK_HOURS_SQL } from "@/data/queries/today";
import { SettingsRepo, WorkHoursRepo, type SettingsPatch } from "@/data/repositories/settings-repo";
import type { UserSettingsRow, WorkHoursRow } from "@/data/schema.client";
import { applyTheme } from "@/features/commands/theme";
import { applyLook } from "@/features/looks/look";
import { BUILD_ID } from "@/data/build-id";
import { useCalendar } from "@/features/calendar/use-calendar";
import { useExport } from "@/features/export/use-export";
import { usePush } from "@/features/notifications/use-push";
import { usePwa } from "@/features/pwa/pwa-provider";
import { applyMotion, readMotion, subscribeMotion, type MotionChoice } from "@/features/settings/motion";
import { SECTION_VIEWS, loadAllSections } from "@/features/settings/section-islands";
import { SECTIONS, sectionSummary } from "@/features/settings/sections";
import { SettingsLayout, useSettingsSection } from "@/features/settings/settings-layout";
import { withPendingDays, type Segment } from "@/features/settings/settings-rules";
// How the row reads as the form's values is shared with the Android app's Settings (settings-values.ts).
import { USER_SQL, asPatch, asValues, caughtUp, settingsValues } from "@/features/settings/settings-values";
import type { SettingsFormProps, SettingsValues } from "@/features/settings/types";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { LOADING_LINE } from "../loading-view";

// Account's "Signed in with" asks the auth server when the section opens; the loader (and the auth client behind it)
// stays out of the shell.
const signInMethods = () => import("@/features/account/sign-in-methods").then((m) => m.loadSignInMethods());

export default function SettingsPage() {
  const db = useLocalDatabase();
  const settingsRepo = useMemo(() => new SettingsRepo(db), [db]);
  const hoursRepo = useMemo(() => new WorkHoursRepo(db), [db]);
  const pwa = usePwa();
  const push = usePush();
  const exporter = useExport();
  const calendar = useCalendar();
  const active = useSettingsSection();
  const motion = useSyncExternalStore(subscribeMotion, readMotion, () => "system" as MotionChoice);
  const [leaving, setLeaving] = useState(false);
  const [unsynced, setUnsynced] = useState<number | null>(null);
  const { data: settings } = useQuery<UserSettingsRow & { id: string }>(SETTINGS_SQL);
  const { data: hours } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const { data: users } = useQuery<{ id: string; email: string | null; display_name: string | null; avatar_url: string | null; personal_space_id: string | null }>(USER_SQL);
  const s = settings?.[0];
  const user = users?.[0];

  // Every section's controls are fetched once the browser is idle, so opening one never waits (§11.6).
  useEffect(() => preloadOnIdle(loadAllSections), []);

  const base: SettingsValues | null = s ? settingsValues(s) : null;
  // Writes are local and land at once, but the query that redraws the controls can trail them by a second while an
  // upload holds the write lock: the walkthrough saw controls snap back to the old value. The choice shows straight
  // away and stays until the row says the same.
  const [pending, setPending] = useState<SettingsPatch>({});
  if (base && Object.keys(pending).length > 0 && caughtUp(base, pending)) setPending({});
  const values: SettingsValues | null = base ? { ...base, ...asValues(pending) } : null;
  const undo = useUndoSink();

  // Each weekday's segments in start order (0 = Monday); an empty list is a day off.
  const savedHours = useMemo(() => {
    const byDay: Segment[][] = [[], [], [], [], [], [], []];
    for (const h of hours ?? []) {
      if (h.weekday != null && h.weekday >= 0 && h.weekday <= 6 && h.start_time && h.end_time) byDay[h.weekday].push({ start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) });
    }
    for (const day of byDay) day.sort((a, b) => a.start.localeCompare(b.start));
    return byDay;
  }, [hours]);
  // The same trailing query as the settings row: a day just written shows (and is what its ⌘Z goes back from) until
  // the rows say the same, so a quick second edit does not take an undo point from before the first.
  const [hoursPending, setHoursPending] = useState<Partial<Record<number, Segment[]>>>({});
  const { week: workHours, settled } = useMemo(() => withPendingDays(savedHours, hoursPending), [savedHours, hoursPending]);
  if (settled.length > 0) setHoursPending((p) => Object.fromEntries(Object.entries(p).filter(([d]) => !settled.includes(Number(d)))));
  const detected = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return null;
    }
  }, []);

  // Every change answers ⌘Z (SCREENS.md §18: "saves immediately with an inline Saved and a Cmd+Z undo"); silent, as
  // the inline Saved already confirms it.
  const write = (id: string, patch: SettingsPatch) => {
    setPending((p) => ({ ...p, ...patch }));
    if (patch.theme) applyTheme(patch.theme);
    if (patch.look) applyLook(patch.look);
    return settingsRepo.update(id, patch);
  };
  const onChange = (patch: SettingsPatch) => {
    if (!s || !values) return;
    const previous = asPatch(values, Object.keys(patch) as (keyof SettingsPatch)[]);
    void write(s.id, patch);
    undo?.record(valueEntry("Changed a setting", (to: SettingsPatch) => write(s.id, to), previous, patch));
  };
  // A day's segments are written together, so one ⌘Z puts the whole day back.
  const onWorkHours = (weekday: number, segments: Segment[]) => {
    if (!user?.personal_space_id) return;
    const ctx = { spaceId: user.personal_space_id, userId: user.id };
    const previous = workHours[weekday] ?? [];
    const writeDay = (segs: readonly Segment[]) => {
      setHoursPending((p) => ({ ...p, [weekday]: [...segs].sort((a, b) => a.start.localeCompare(b.start)) }));
      return hoursRepo.replaceDay(weekday, segs, ctx);
    };
    void writeDay(segments);
    undo?.record(valueEntry("Changed working hours", writeDay, previous, segments));
  };
  // Reduce motion is this device's choice, like the theme; it answers ⌘Z too.
  const onMotion = (next: MotionChoice) => {
    const previous = readMotion();
    applyMotion(next);
    undo?.record(valueEntry("Changed a setting", applyMotion, previous, next));
  };

  async function signOut(anyway = false) {
    setLeaving(true);
    if (anyway) setUnsynced(null);
    // The palette's Sign out runs the same path (features/account/sign-out.ts), loaded only when someone signs out.
    const { signOutDevice } = await import("@/features/account/sign-out");
    // Clearing the device with changes still queued would lose them without a word: say so and let the person choose.
    const waiting = await signOutDevice(db, anyway);
    if (waiting > 0) {
      setUnsynced(waiting);
      setLeaving(false);
    }
  }

  if (!values) {
    return (
      <main className={VIEW_COLUMN}>
        <ViewHeader eyebrow="Settings" title="Your day" subtitle="Every change saves as you make it." />
        <p className={LOADING_LINE}>Opening…</p>
      </main>
    );
  }

  const props: SettingsFormProps = {
    values,
    workHours,
    detectedTimeZone: detected,
    account: { name: user?.display_name ?? null, email: user?.email ?? null, avatarUrl: user?.avatar_url ?? null },
    signInMethods,
    app: { install: pwa.install, persistence: pwa.persistence, version: BUILD_ID, onInstall: () => void pwa.promptInstall() },
    notifications: {
      copy: push.copy,
      subscribed: push.subscribed,
      busy: push.busy,
      error: push.error,
      onEnable: () => void push.enable(),
      onDisable: () => void push.disable(),
    },
    calendar,
    data: { onExport: (format) => void exporter.exportData(format), busy: exporter.busy, error: exporter.error, lastFile: exporter.lastFile },
    motion: { value: motion, onChange: onMotion },
    onChange,
    onWorkHours,
    onSignOut: () => void signOut(),
    signingOut: leaving,
    unsynced,
    onSignOutAnyway: () => void signOut(true),
    onStaySignedIn: () => setUnsynced(null),
  };
  const summary = {
    values,
    workHours,
    email: user?.email ?? null,
    calendars: calendar.configured === null && calendar.accounts.length === 0 ? null : { accounts: calendar.accounts.length, busy: calendar.calendars.filter((c) => c.read).length },
    subscribed: push.permission === "unsupported" ? null : push.subscribed,
    motion,
    version: BUILD_ID,
  };
  const items = SECTIONS.map((sec) => ({ ...sec, summary: sectionSummary(sec.key, summary) }));

  return (
    <main className={VIEW_COLUMN}>
      <SettingsLayout
        items={items}
        active={active}
        render={(key) => {
          const View = SECTION_VIEWS[key];
          return <View {...props} />;
        }}
      />
    </main>
  );
}
