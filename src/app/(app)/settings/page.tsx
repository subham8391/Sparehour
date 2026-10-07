"use client";
// Settings (SCREENS.md §18): what the app knows about your day, editable in
// place, and the way out. A section list with the open section beside it from
// 900 px, a list that pushes into each section below it. The page owns the
// data, the writes and their undo; each section's controls are an island.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isTodaySort } from "@/core/today/sort-options";
import type { MissPolicy } from "@/core/types";
import { useUndoSink } from "@/features/undo/undo-provider";
import { useLocalDatabase, useQuery, type LocalDatabase } from "@/data/powersync";
import { SETTINGS_SQL, WORK_HOURS_SQL } from "@/data/queries/today";
import { SettingsRepo, WorkHoursRepo, type OpenTo, type SettingsPatch } from "@/data/repositories/settings-repo";
import type { UserSettingsRow, WorkHoursRow } from "@/data/schema.client";
import { applyTheme } from "@/features/commands/theme";
import { BUILD_ID } from "@/data/build-id";
import { clearThisDevice } from "@/features/account/clear-device";
import { loadSignInMethods } from "@/features/account/identity";
import { useCalendar } from "@/features/calendar/use-calendar";
import { useExport } from "@/features/export/use-export";
import { usePush } from "@/features/notifications/use-push";
import { usePwa } from "@/features/pwa/pwa-provider";
import { applyMotion, readMotion, subscribeMotion, type MotionChoice } from "@/features/settings/motion";
import { SECTION_VIEWS, loadAllSections } from "@/features/settings/section-islands";
import { SECTIONS, sectionSummary } from "@/features/settings/sections";
import { SettingsLayout, useSettingsSection } from "@/features/settings/settings-layout";
import { withPendingDays, type Segment } from "@/features/settings/settings-rules";
import type { SettingsFormProps, SettingsValues } from "@/features/settings/types";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { LOADING_LINE } from "../loading-view";

const USER_SQL = `select id, email, display_name, avatar_url, personal_space_id from users limit 1`;

const MISS_POLICIES: readonly MissPolicy[] = ["carry", "skip", "expire"];
const OPEN_TO: readonly OpenTo[] = ["today", "inbox", "upcoming"];
const LEADS = [0, 5, 10, 15];

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
  const [testResult, setTestResult] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [unsynced, setUnsynced] = useState<number | null>(null);
  const { data: settings } = useQuery<UserSettingsRow & { id: string }>(SETTINGS_SQL);
  const { data: hours } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const { data: users } = useQuery<{ id: string; email: string | null; display_name: string | null; avatar_url: string | null; personal_space_id: string | null }>(USER_SQL);
  const s = settings?.[0];
  const user = users?.[0];

  // Every section's controls are fetched once the browser is idle, so opening one never waits (§11.6).
  useEffect(() => preloadOnIdle(loadAllSections), []);

  const base: SettingsValues | null = s
    ? {
        timezone: s.timezone ?? "UTC",
        weekStart: s.week_start ?? 0,
        dayRolloverHour: s.day_rollover_hour ?? 4,
        bufferPct: s.buffer_pct ?? 15,
        defaultEstimateMin: s.default_estimate_min ?? 30,
        carryAskAfter: s.carry_ask_after ?? 3,
        autoSomedayDays: s.auto_someday_days ?? 30,
        carryReview: (s.carry_review ?? 1) === 1,
        eveningStartsAt: (s.evening_starts_at ?? "18:00").slice(0, 5),
        eveningEndsAt: (s.evening_ends_at ?? "22:00").slice(0, 5),
        theme: (s.theme === "light" || s.theme === "dark" ? s.theme : "system") as SettingsValues["theme"],
        notifyBlockStart: (s.notify_block_start ?? 1) === 1,
        notifyDeadline: (s.notify_deadline ?? 1) === 1,
        notifyMorning: (s.notify_morning ?? 1) === 1,
        notifyShutdown: (s.notify_shutdown ?? 0) === 1,
        morningNudgeTime: (s.morning_nudge_time ?? "").slice(0, 5),
        shutdownNudgeTime: (s.shutdown_nudge_time ?? "").slice(0, 5),
        quietHoursStart: (s.quiet_hours_start ?? "").slice(0, 5),
        quietHoursEnd: (s.quiet_hours_end ?? "").slice(0, 5),
        blockStartLeadMin: LEADS.includes(s.block_start_lead_min ?? 0) ? (s.block_start_lead_min ?? 0) : 0,
        badgeEnabled: (s.badge_enabled ?? 1) === 1,
        defaultMissPolicy: MISS_POLICIES.includes(s.default_miss_policy as MissPolicy) ? (s.default_miss_policy as MissPolicy) : "carry",
        defaultView: OPEN_TO.includes(s.default_view as OpenTo) ? (s.default_view as OpenTo) : "today",
        todaySort: isTodaySort(s.today_sort) ? s.today_sort : "manual",
        showCompleted: s.show_completed === 1,
      }
    : null;
  // Writes are local and land at once, but the query that redraws the controls can trail them by a second while an
  // upload holds the write lock: the walkthrough saw controls snap back to the old value. The choice shows straight
  // away and stays until the row says the same.
  const [pending, setPending] = useState<SettingsPatch>({});
  const pendingKeys = Object.keys(pending) as (keyof SettingsPatch)[];
  if (base && pendingKeys.length > 0 && pendingKeys.every((k) => (base[k] ?? "") === (pending[k] ?? ""))) setPending({});
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
    return settingsRepo.update(id, patch);
  };
  const onChange = (patch: SettingsPatch) => {
    if (!s || !values) return;
    const previous = asPatch(values, Object.keys(patch) as (keyof SettingsPatch)[]);
    void write(s.id, patch);
    undo?.record({ label: "Changed a setting", toast: false, undo: () => write(s.id, previous) });
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
    undo?.record({ label: "Changed working hours", toast: false, undo: () => writeDay(previous) });
  };
  // Reduce motion is this device's choice, like the theme; it answers ⌘Z too.
  const onMotion = (next: MotionChoice) => {
    const previous = readMotion();
    applyMotion(next);
    undo?.record({ label: "Changed a setting", toast: false, undo: async () => applyMotion(previous) });
  };

  async function signOut(anyway = false) {
    setLeaving(true);
    // Clearing the device with changes still queued would lose them without a word: say so and let the person choose.
    if (!anyway) {
      const waiting = await waitForUploads(db);
      if (waiting > 0) {
        setUnsynced(waiting);
        setLeaving(false);
        return;
      }
    }
    setUnsynced(null);
    // A shared device must not keep the last person's data: clear the local database, then the session.
    // The auth client is loaded here rather than with the page (§11.6 budgets).
    const { supabaseBrowser } = await import("@/data/supabase-browser");
    await clearThisDevice(db);
    // This device only: a global sign-out also ended every other device's session, leaving a phone retrying a dead token.
    await supabaseBrowser().auth.signOut({ scope: "local" });
    // A full load, not a client navigation: the router's cache would otherwise bring the signed-in screens back on Back.
    window.location.replace("/login");
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
    signInMethods: loadSignInMethods,
    app: { install: pwa.install, persistence: pwa.persistence, version: BUILD_ID, onInstall: () => void pwa.promptInstall() },
    notifications: {
      copy: push.copy,
      subscribed: push.subscribed,
      busy: push.busy,
      error: push.error,
      onEnable: () => void push.enable(),
      onDisable: () => void push.disable(),
      onTest: () => void push.sendTest().then((n) => setTestResult(n > 0 ? `Sent to ${n} ${n === 1 ? "device" : "devices"}.` : "Nothing was reached — is this device subscribed?")),
      testResult,
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

/** Changes still waiting to upload. A connection that is up gets a few seconds to send them first. */
async function waitForUploads(db: LocalDatabase): Promise<number> {
  const until = Date.now() + 8000;
  let { count } = await db.getUploadQueueStats();
  while (count > 0 && navigator.onLine && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    ({ count } = await db.getUploadQueueStats());
  }
  return count;
}

/** The form's shape of a patch: a cleared nudge time is "" there, null in the row. */
function asValues(patch: SettingsPatch): Partial<SettingsValues> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) out[k] = v ?? "";
  return out as Partial<SettingsValues>;
}

/** What the given keys were, as a patch that writes them back. */
function asPatch(values: SettingsValues, keys: readonly (keyof SettingsPatch)[]): SettingsPatch {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = values[k as keyof SettingsValues];
    out[k] = v === "" ? null : v;
  }
  return out as SettingsPatch;
}
