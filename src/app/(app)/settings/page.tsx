"use client";
// Settings (SCREENS.md §18): what the app knows about your day, and the way
// out. Editing work hours and the day's shape arrives with P6; until then the
// values are shown as they are, with no controls that pretend otherwise.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { formatTime, localTime } from "@/core/time";
import { supabaseBrowser } from "@/data/supabase-browser";
import { SETTINGS_SQL, WORK_HOURS_SQL } from "@/data/queries/today";
import type { UserSettingsRow, WorkHoursRow } from "@/data/schema.client";
import { ViewHeader } from "@/features/shell/view-header";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const USER_SQL = `select email, display_name from users limit 1`;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-t border-line px-4 py-2 first:border-t-0">
      <dt className="text-[15px] text-ink-2">{label}</dt>
      <dd className="font-mono text-[13px] text-ink">{value}</dd>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const db = useLocalDatabase();
  const [leaving, setLeaving] = useState(false);
  const { data: settings } = useQuery<UserSettingsRow>(SETTINGS_SQL);
  const { data: hours } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const { data: user } = useQuery<{ email: string | null; display_name: string | null }>(USER_SQL);
  const s = settings?.[0];
  const byDay = new Map((hours ?? []).map((h) => [h.weekday, h]));
  const time = (t: string | null | undefined) => (t ? formatTime(localTime(t.slice(0, 5))) : "—");

  async function signOut() {
    setLeaving(true);
    // A shared device must not keep the last person's data: clear the local database, then the session.
    await db.disconnectAndClear();
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <ViewHeader eyebrow="Settings" title={user?.[0]?.display_name ?? "Your day"} subtitle={user?.[0]?.email ?? undefined} />

      <section className="flex flex-col gap-2">
        <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Your day</h2>
        <dl className="rounded-xl border border-line bg-surface">
          <Row label="Timezone" value={s?.timezone ?? "—"} />
          <Row label="Day starts at" value={s ? `${String(s.day_rollover_hour ?? 4).padStart(2, "0")}:00` : "—"} />
          <Row label="Evening starts at" value={time(s?.evening_starts_at)} />
          <Row label="Buffer between tasks" value={s ? `${s.buffer_pct ?? 15}%` : "—"} />
          <Row label="Default estimate" value={s ? `${s.default_estimate_min ?? 30}m` : "—"} />
          <Row label="Ask about carried-over tasks after" value={s ? `${s.carry_ask_after ?? 3} days` : "—"} />
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Work hours</h2>
        <dl className="rounded-xl border border-line bg-surface">
          {WEEKDAYS.map((name, i) => {
            const h = byDay.get(i);
            return <Row key={name} label={name} value={h ? `${time(h.start_time)} – ${time(h.end_time)}` : "Off"} />;
          })}
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={leaving}
          className="h-11 self-start rounded-xl border border-line bg-surface px-4 text-[15px] font-medium text-ink hover:border-line-strong disabled:opacity-60"
        >
          {leaving ? "Signing out…" : "Sign out"}
        </button>
        <p className="text-[13px] text-ink-3">Signing out removes your data from this device. It stays safe in your account.</p>
      </section>
    </main>
  );
}
