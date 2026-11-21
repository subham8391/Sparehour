// What Settings reads and writes on the phone (the web's page does the same in app/(app)/settings/page.tsx): the one
// settings row as the form's values, the working week, who is signed in, and the two writes, each saved at once
// through the shared repositories. The row's reading, its defaults and the "shown until the row catches up" rule
// are the web's own (features/settings/settings-values.ts, settings-rules.ts). The theme is the one value not read
// from the row: it is this phone's own choice (~/ui/theme-choice).
//
// The web answers ⌘Z for a setting with a silent entry (no toast). A phone has no ⌘Z, and a silent entry would sit
// on top of the undo history where the toast's Undo would take it back in place of the change the toast names, so
// none is recorded here; a setting is put back by changing it back.
import { useCallback, useMemo, useState } from "react";
import { useLocalDatabase, useQuery, type LocalDatabase } from "@/data/powersync";
import { SETTINGS_SQL, WORK_HOURS_SQL } from "@/data/queries/today";
import { SettingsRepo, WorkHoursRepo, type SettingsPatch } from "@/data/repositories/settings-repo";
import type { UserSettingsRow, WorkHoursRow } from "@/data/schema.client";
import { withPendingDays, type Segment } from "@/features/settings/settings-rules";
import { USER_SQL, asValues, caughtUp, settingsValues, type SettingsValues } from "@/features/settings/settings-values";
import { detectedZone, weekFromRows } from "@/features/welcome/welcome-rules";
import { setThemeChoice, useThemeChoice, type ThemeChoice } from "~/ui/theme-choice";

export interface SettingsUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  spaceId: string | null;
}

export interface SettingsData {
  /** Null until the settings row has been read. */
  values: SettingsValues | null;
  /** Each weekday's stretches in start order (0 = Monday); an empty list is a day off. */
  workHours: Segment[][];
  user: SettingsUser | null;
  /** The zone the phone is in, for the "Detected …" hint. */
  detectedTimeZone: string | null;
  change: (patch: SettingsPatch) => void;
  /** Replaces a weekday's stretches in one step; an empty list makes it a day off. */
  setWorkHours: (weekday: number, segments: Segment[]) => void;
  /** This phone's theme: kept on the device, never written to the account. */
  setTheme: (theme: ThemeChoice) => void;
}

interface UserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  personal_space_id: string | null;
}

export function useSettings(): SettingsData {
  const db = useLocalDatabase() as LocalDatabase;
  const settingsRepo = useMemo(() => new SettingsRepo(db), [db]);
  const hoursRepo = useMemo(() => new WorkHoursRepo(db), [db]);
  const theme = useThemeChoice();
  const { data: settings } = useQuery<UserSettingsRow & { id: string }>(SETTINGS_SQL);
  const { data: hours } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const { data: users } = useQuery<UserRow>(USER_SQL);
  const row = settings?.[0];
  const u = users?.[0];

  const base = useMemo(() => (row ? settingsValues(row) : null), [row]);
  // A choice shows straight away and stays until the row says the same (settings-values.ts).
  const [pending, setPending] = useState<SettingsPatch>({});
  if (base && Object.keys(pending).length > 0 && caughtUp(base, pending)) setPending({});
  const values = useMemo<SettingsValues | null>(() => (base ? { ...base, ...asValues(pending), theme } : null), [base, pending, theme]);

  const saved = useMemo(() => weekFromRows(hours ?? []), [hours]);
  const [hoursPending, setHoursPending] = useState<Partial<Record<number, Segment[]>>>({});
  const { week: workHours, settled } = useMemo(() => withPendingDays(saved, hoursPending), [saved, hoursPending]);
  if (settled.length > 0) setHoursPending((p) => Object.fromEntries(Object.entries(p).filter(([d]) => !settled.includes(Number(d)))));

  const id = row?.id ?? null;
  const change = useCallback(
    (patch: SettingsPatch) => {
      if (!id) return;
      setPending((p) => ({ ...p, ...patch }));
      void settingsRepo.update(id, patch);
    },
    [id, settingsRepo],
  );
  const userId = u?.id ?? null;
  const spaceId = u?.personal_space_id ?? null;
  const setWorkHours = useCallback(
    (weekday: number, segments: Segment[]) => {
      if (!userId || !spaceId) return;
      // A day's stretches are written together (WorkHoursRepo.replaceDay).
      setHoursPending((p) => ({ ...p, [weekday]: [...segments].sort((a, b) => a.start.localeCompare(b.start)) }));
      void hoursRepo.replaceDay(weekday, segments, { spaceId, userId });
    },
    [userId, spaceId, hoursRepo],
  );
  const detectedTimeZone = useMemo(detectedZone, []);
  const user = useMemo<SettingsUser | null>(() => (u ? { id: u.id, email: u.email, name: u.display_name, avatarUrl: u.avatar_url, spaceId: u.personal_space_id } : null), [u]);

  return { values, workHours, user, detectedTimeZone, change, setWorkHours, setTheme: setThemeChoice };
}
