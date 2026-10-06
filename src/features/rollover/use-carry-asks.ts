"use client";
// The three-carry ask's throttle (PRODUCT_SPEC.md §8.3.4, SCREENS.md §2.3):
// one hook for Today, the morning plan and the morning review, so all three
// show the same asks and record them the same way. Which tasks ask is the
// pure `pickAsks`; this reads when each task was last asked and records the
// ones it starts showing on tasks.carry_asked_at — the person's own column,
// which the server does not count as a touch.
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@/data/powersync";
import { pickAsks } from "@/core/rollover/carried";
import { Temporal, type Instant, type LocalDate } from "@/core/time";
import type { Task } from "@/core/types";
import { normaliseTimestamp } from "@/data/mappers";

/**
 * Tasks asked since the day before `?` (a UTC date), in any state: one answered with Someday or Drop has left
 * the carried list but still counts toward today's two. The exact cut is made in JS, as timestamps arrive in
 * two spellings.
 */
export const ASKED_SINCE_SQL = `
  select id, carry_asked_at from tasks
  where deleted_at is null and carry_asked_at is not null and substr(replace(carry_asked_at, ' ', 'T'), 1, 10) >= ?`;
const NOTHING_SQL = `select id, carry_asked_at from tasks where 0`;

export interface CarryAskOptions {
  /** The setting; null until the settings row is here, and then nothing asks. */
  carryAskAfter: number | null;
  today: LocalDate;
  zone: string;
  now: Instant;
}

const instantOf = (v: string | null): Instant | null => {
  if (!v) return null;
  try {
    return Temporal.Instant.from(normaliseTimestamp(v));
  } catch {
    return null;
  }
};

export interface CarryAsks {
  /** The carried tasks that show the ask now. */
  asks: ReadonlySet<string>;
  /** Those of them not yet recorded today: what `useRecordAsks` writes once the asks are on screen. */
  fresh: readonly string[];
}

/** Which carried tasks show the ask now, and which of those are new today. Reads only. */
export function useCarryAsks(carried: readonly Task[], { carryAskAfter, today, zone, now }: CarryAskOptions): CarryAsks {
  const dayStart = useMemo(() => today.toZonedDateTime({ timeZone: zone, plainTime: Temporal.PlainTime.from("00:00") }).toInstant(), [today, zone]);
  const since = dayStart.toZonedDateTimeISO("UTC").toPlainDate().subtract({ days: 1 }).toString();
  const anyAtThreshold = carryAskAfter !== null && carried.some((t) => t.carryCount >= carryAskAfter);
  const { data: rows, isLoading } = useQuery<{ id: string; carry_asked_at: string | null }>(anyAtThreshold ? ASKED_SINCE_SQL : NOTHING_SQL, anyAtThreshold ? [since] : []);

  const { asks, fresh } = useMemo(() => {
    if (!anyAtThreshold || carryAskAfter === null || isLoading || !rows) return { asks: new Set<string>(), fresh: [] as string[] };
    const askedToday = new Set<string>();
    for (const r of rows) {
      const at = instantOf(r.carry_asked_at);
      if (at && Temporal.Instant.compare(at, dayStart) >= 0) askedToday.add(r.id);
    }
    const picked = pickAsks(carried, { carryAskAfter }, { askedToday, askedAt: (t) => t.carryAskedAt ?? null, now });
    return { asks: picked as ReadonlySet<string>, fresh: [...picked].filter((id) => !askedToday.has(id)) };
  }, [anyAtThreshold, carryAskAfter, isLoading, rows, dayStart, carried, now]);

  return useMemo(() => ({ asks, fresh }), [asks, fresh]);
}

/**
 * Records the asks a screen has just put in front of the person (tasks.carry_asked_at), once each. `visible` false
 * (a folded section, a step not reached yet) records nothing: an ask that was never seen does not start the week.
 */
export function useRecordAsks(fresh: readonly string[], markAsked: ((ids: readonly string[], at: string) => Promise<void>) | undefined, visible = true): void {
  const written = useRef(new Set<string>());
  const freshKey = fresh.join(",");
  useEffect(() => {
    if (!markAsked || !visible || !freshKey) return;
    const ids = freshKey.split(",").filter((id) => !written.current.has(id));
    if (ids.length === 0) return;
    for (const id of ids) written.current.add(id);
    void markAsked(ids, new Date().toISOString());
  }, [freshKey, markAsked, visible]);
}
