// What Settings reads and writes on the phone (the web's page does the same in app/(app)/settings/page.tsx): the one
// settings row as the form's values, the working week, who is signed in, and the writes, each saved at once through
// the shared repositories. The row's reading, its defaults and the "shown until the row catches up" rule are the
// web's own (features/settings/settings-values.ts, settings-rules.ts). The theme and the look are the account's, as
// on the web: a change is written to the row and shown at once from this phone's copy (~/ui/theme-choice,
// ~/ui/looks/look-choice). Reduce motion is this phone's own (~/ui/motion), never the account's.
//
// Every change records the undo the web's page records (SCREENS.md §18: "saves immediately with an inline Saved and
// an undo"): the same silent entry, by the same words (features/undo/value-entry.ts, settings-values.ts). Silent means
// no toast of its own, as on the web: the inline "Saved" confirms the change.
import { useMemo, useState } from "react";
import { useLocalDatabase, useQuery, type LocalDatabase } from "@/data/powersync";
import { SETTINGS_SQL, WORK_HOURS_SQL } from "@/data/queries/today";
import { SettingsRepo, WorkHoursRepo, type SettingsPatch } from "@/data/repositories/settings-repo";
import type { UserSettingsRow, WorkHoursRow } from "@/data/schema.client";
import { withPendingDays, type Segment } from "@/features/settings/settings-rules";
import { HOURS_CHANGED, SETTING_CHANGED, USER_SQL, asPatch, asValues, caughtUp, settingsValues, type MotionChoice, type SettingsValues } from "@/features/settings/settings-values";
import { useUndoSink } from "@/features/undo/undo-context";
import { valueEntry } from "@/features/undo/value-entry";
import { detectedZone, weekFromRows } from "@/features/welcome/welcome-rules";
import { setLookChoice } from "~/ui/looks/look-choice";
import { motionChoice, setMotionChoice, useMotionChoice } from "~/ui/motion";
import { setThemeChoice } from "~/ui/theme-choice";

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
  /** Reduce motion on this phone, and the way to change it. */
  motion: { value: MotionChoice; onChange: (next: MotionChoice) => void };
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
  const undo = useUndoSink();
  const motion = useMotionChoice();
  const { data: settings } = useQuery<UserSettingsRow & { id: string }>(SETTINGS_SQL);
  const { data: hours } = useQuery<WorkHoursRow>(WORK_HOURS_SQL);
  const { data: users } = useQuery<UserRow>(USER_SQL);
  const row = settings?.[0];
  const u = users?.[0];

  const base = useMemo(() => (row ? settingsValues(row) : null), [row]);
  // A choice shows straight away and stays until the row says the same (settings-values.ts).
  const [pending, setPending] = useState<SettingsPatch>({});
  if (base && Object.keys(pending).length > 0 && caughtUp(base, pending)) setPending({});
  const values = useMemo<SettingsValues | null>(() => (base ? { ...base, ...asValues(pending) } : null), [base, pending]);

  const saved = useMemo(() => weekFromRows(hours ?? []), [hours]);
  const [hoursPending, setHoursPending] = useState<Partial<Record<number, Segment[]>>>({});
  const { week: workHours, settled } = useMemo(() => withPendingDays(saved, hoursPending), [saved, hoursPending]);
  if (settled.length > 0) setHoursPending((p) => Object.fromEntries(Object.entries(p).filter(([d]) => !settled.includes(Number(d)))));

  const id = row?.id ?? null;
  const change = (patch: SettingsPatch) => {
    if (!id || !values) return;
    // The theme and the look are drawn from this phone's copy: it follows at once, as the web's page stamps its own.
    const write = (to: SettingsPatch) => {
      setPending((p) => ({ ...p, ...to }));
      if (to.theme) setThemeChoice(to.theme);
      if (to.look) setLookChoice(to.look);
      return settingsRepo.update(id, to);
    };
    const previous = asPatch(values, Object.keys(patch) as (keyof SettingsPatch)[]);
    void write(patch);
    undo?.record(valueEntry(SETTING_CHANGED, write, previous, patch));
  };
  const setWorkHours = (weekday: number, segments: Segment[]) => {
    if (!u?.personal_space_id) return;
    const ctx = { spaceId: u.personal_space_id, userId: u.id };
    const previous = workHours[weekday] ?? [];
    // A day's stretches are written together (WorkHoursRepo.replaceDay), so one undo puts the whole day back.
    const writeDay = (segs: readonly Segment[]) => {
      setHoursPending((p) => ({ ...p, [weekday]: [...segs].sort((a, b) => a.start.localeCompare(b.start)) }));
      return hoursRepo.replaceDay(weekday, segs, ctx);
    };
    void writeDay(segments);
    undo?.record(valueEntry(HOURS_CHANGED, writeDay, previous, segments));
  };
  // Reduce motion is this phone's choice; it records its undo too, as on the web.
  const onMotion = (next: MotionChoice) => {
    const previous = motionChoice();
    setMotionChoice(next);
    undo?.record(valueEntry(SETTING_CHANGED, setMotionChoice, previous, next));
  };
  const detectedTimeZone = useMemo(detectedZone, []);
  const user = useMemo<SettingsUser | null>(() => (u ? { id: u.id, email: u.email, name: u.display_name, avatarUrl: u.avatar_url, spaceId: u.personal_space_id } : null), [u]);

  return { values, workHours, user, detectedTimeZone, change, setWorkHours, motion: { value: motion, onChange: onMotion } };
}
