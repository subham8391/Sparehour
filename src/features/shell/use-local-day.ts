"use client";
// "Today" as the user experiences it: their timezone and their day-rollover
// hour (04:00 by default), from the synced settings row. Ticks once a minute
// so a screen left open crosses midnight on its own.
import { useEffect, useState } from "react";
import { useQuery } from "@/data/powersync";
import { Temporal, todayFor, type LocalDate } from "@/core/time";
import { toSettings, type Settings } from "@/data/mappers";
import { SETTINGS_SQL } from "@/data/queries/today";
import type { UserSettingsRow } from "@/data/schema.client";

export function useNow(intervalMs = 60_000): Temporal.Instant {
  const [now, setNow] = useState(() => Temporal.Now.instant());
  useEffect(() => {
    const id = setInterval(() => setNow(Temporal.Now.instant()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useLocalDay(now: Temporal.Instant): { today: LocalDate; settings: Settings | null; zone: string } {
  const { data } = useQuery<UserSettingsRow>(SETTINGS_SQL);
  const settings = data?.[0] ? toSettings(data[0]) : null;
  const zone = settings?.timezone ?? "UTC";
  const today = todayFor({ timezone: zone, dayRolloverHour: settings?.dayRolloverHour ?? 4 }, now);
  return { today, settings, zone };
}
