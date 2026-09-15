"use client";
// Settings (SCREENS.md §18): what the app knows about your day, editable in
// place, and the way out.
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { SETTINGS_SQL, WORK_HOURS_SQL } from "@/data/queries/today";
import { SettingsRepo, WorkHoursRepo, type SettingsPatch } from "@/data/repositories/settings-repo";
import type { UserSettingsRow, WorkHoursRow } from "@/data/schema.client";
import { applyTheme } from "@/features/commands/theme";
import { BUILD_ID } from "@/data/build-id";
import { useCalendar } from "@/features/calendar/use-calendar";
import { useExport } from "@/features/export/use-export";
import { usePush } from "@/features/notifications/use-push";
import { usePwa } from "@/features/pwa/pwa-provider";
import { SettingsForm, type SettingsValues } from "@/features/settings/settings-form";
import type { Segment } from "@/features/settings/settings-rules";
import { ViewHeader } from "@/features/shell/view-header";

const USER_SQL = `select id, email, display_name, personal_space_id from users limit 1`;

export default function SettingsPage() {
  const router = useRouter();
  const db = useLocalDatabase();
  const settingsRepo = useMemo(() => new SettingsRepo(db), [db]);
  const hoursRepo = useMemo(() => new WorkHoursRepo(db), [db]);
  const pwa = usePwa();
  const push = usePush();
  const exporter = useExport();
  const calendar = useCalendar();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const { data: settings } = useQuery<UserSettingsRow & { id: string }>(SETTINGS_SQL);
  const { data: hours } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const { data: users } = useQuery<{ id: string; email: string | null; display_name: string | null; personal_space_id: string | null }>(USER_SQL);
  const s = settings?.[0];
  const user = users?.[0];

  const values: SettingsValues | null = s
    ? {
        timezone: s.timezone ?? "UTC",
        weekStart: s.week_start ?? 0,
        dayRolloverHour: s.day_rollover_hour ?? 4,
        bufferPct: s.buffer_pct ?? 15,
        defaultEstimateMin: s.default_estimate_min ?? 30,
        carryAskAfter: s.carry_ask_after ?? 3,
        autoSomedayDays: s.auto_someday_days ?? 30,
        eveningStartsAt: (s.evening_starts_at ?? "18:00").slice(0, 5),
        theme: (s.theme === "light" || s.theme === "dark" ? s.theme : "system") as SettingsValues["theme"],
        notifyBlockStart: (s.notify_block_start ?? 1) === 1,
        notifyDeadline: (s.notify_deadline ?? 1) === 1,
        notifyMorning: (s.notify_morning ?? 1) === 1,
        notifyShutdown: (s.notify_shutdown ?? 0) === 1,
        morningNudgeTime: (s.morning_nudge_time ?? "").slice(0, 5),
        shutdownNudgeTime: (s.shutdown_nudge_time ?? "").slice(0, 5),
        quietHoursStart: (s.quiet_hours_start ?? "").slice(0, 5),
        quietHoursEnd: (s.quiet_hours_end ?? "").slice(0, 5),
      }
    : null;
  const workHours = useMemo(() => {
    const byDay: (Segment | null)[] = [null, null, null, null, null, null, null];
    for (const h of hours ?? []) {
      if (h.weekday != null && h.start_time && h.end_time) byDay[h.weekday] = { start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) };
    }
    return byDay;
  }, [hours]);
  const detected = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      return null;
    }
  }, []);

  const onChange = (patch: SettingsPatch) => {
    if (!s) return;
    if (patch.theme) applyTheme(patch.theme);
    void settingsRepo.update(s.id, patch);
  };
  const onWorkHours = (weekday: number, segment: Segment | null) => {
    if (!user?.personal_space_id) return;
    if (segment) void hoursRepo.set(weekday, segment.start, segment.end, { spaceId: user.personal_space_id, userId: user.id });
    else void hoursRepo.clear(weekday);
  };

  async function signOut() {
    setLeaving(true);
    // A shared device must not keep the last person's data: clear the local database, then the session.
    // The auth client is loaded here rather than with the page (§11.6 budgets).
    const { supabaseBrowser } = await import("@/data/supabase-browser");
    await db.disconnectAndClear();
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <ViewHeader eyebrow="Settings" title="Your day" subtitle="Every change saves as you make it." />
      {values ? (
        <SettingsForm
          values={values}
          workHours={workHours}
          detectedTimeZone={detected}
          account={{ name: user?.display_name ?? null, email: user?.email ?? null }}
          app={{ install: pwa.install, persistence: pwa.persistence, version: BUILD_ID, onInstall: () => void pwa.promptInstall() }}
          notifications={{
            copy: push.copy,
            subscribed: push.subscribed,
            busy: push.busy,
            error: push.error,
            onEnable: () => void push.enable(),
            onDisable: () => void push.disable(),
            onTest: () => void push.sendTest().then((n) => setTestResult(n > 0 ? `Sent to ${n} ${n === 1 ? "device" : "devices"}.` : "Nothing was reached — is this device subscribed?")),
            testResult,
          }}
          calendar={calendar}
          data={{ onExport: (format) => void exporter.exportData(format), busy: exporter.busy, error: exporter.error, lastFile: exporter.lastFile }}
          onChange={onChange}
          onWorkHours={onWorkHours}
          onSignOut={() => void signOut()}
          signingOut={leaving}
        />
      ) : (
        <p className="text-ink-3">Opening…</p>
      )}
    </main>
  );
}
