// Pure rules behind Settings (SCREENS.md §18): the buffer preview line, a
// work-hours segment's validity, and the choices each control offers.
import { formatMinutes, localTime, minutesOfDay, type LocalTime } from "@/core/time";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export interface Segment {
  start: string; // "09:00"
  end: string; // "18:00"
}

export const DEFAULT_SEGMENT: Segment = { start: "09:00", end: "18:00" };

const parse = (t: string): LocalTime | null => {
  try {
    return /^\d{2}:\d{2}$/.test(t) ? localTime(t) : null;
  } catch {
    return null;
  }
};

/** Minutes between two "HH:MM" values, or null when the pair is not a valid, ordered segment. */
export function segmentMinutes(seg: Segment): number | null {
  const s = parse(seg.start);
  const e = parse(seg.end);
  if (!s || !e) return null;
  const m = minutesOfDay(e) - minutesOfDay(s);
  return m > 0 ? m : null;
}

export function segmentError(seg: Segment): string | null {
  if (!parse(seg.start) || !parse(seg.end)) return "Use a time like 09:00.";
  if (segmentMinutes(seg) === null) return "The day has to end after it starts.";
  return null;
}

/** At most three stretches a day (SCREENS.md §18: "a second or third segment"). */
export const MAX_SEGMENTS = 3;

const toMin = (t: string) => {
  const p = parse(t);
  return p ? minutesOfDay(p) : null;
};
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** The first problem with a day's segments, or null when every one is a valid, ordered stretch. */
export function segmentsError(segments: readonly Segment[]): string | null {
  for (const s of segments) {
    const e = segmentError(s);
    if (e) return e;
  }
  return null;
}

/** Whether any two segments overlap or touch, which the day treats as one stretch. */
export function segmentsOverlap(segments: readonly Segment[]): boolean {
  const sorted = [...segments].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.some((s, i) => i > 0 && s.start <= sorted[i - 1].end);
}

/** The day's segments in order with overlapping or touching ones joined: 09:00–13:00 + 12:00–18:00 → 09:00–18:00. */
export function mergeSegments(segments: readonly Segment[]): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start.localeCompare(b.start));
  const out: Segment[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) out[out.length - 1] = { start: last.start, end: s.end > last.end ? s.end : last.end };
    else out.push({ ...s });
  }
  return out;
}

/**
 * The stretch "Add hours" offers: an hour after the day's last segment ends, an hour long, or the hour before the
 * first one starts when the evening has no room; null when a third already exists or the day is full.
 */
export function nextSegment(segments: readonly Segment[]): Segment | null {
  if (segments.length === 0) return DEFAULT_SEGMENT;
  if (segments.length >= MAX_SEGMENTS) return null;
  const ends = segments.map((s) => toMin(s.end)).filter((m): m is number => m !== null);
  const starts = segments.map((s) => toMin(s.start)).filter((m): m is number => m !== null);
  const lastEnd = Math.max(...ends);
  if (lastEnd + 120 <= 23 * 60 + 59) return { start: toHHMM(lastEnd + 60), end: toHHMM(lastEnd + 120) };
  const firstStart = Math.min(...starts);
  if (firstStart >= 120) return { start: toHHMM(firstStart - 120), end: toHHMM(firstStart - 60) };
  return null;
}

/** "09:00–12:30, 13:30–18:00" — a day's segments in order. */
export function segmentsLabel(segments: readonly Segment[]): string {
  return [...segments]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((s) => `${s.start}–${s.end}`)
    .join(", ");
}

const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** "Mon–Fri", "Mon, Wed, Fri", "Sat–Sun": runs of three or more days are ranges. */
function daysLabel(days: readonly number[]): string {
  const runs: number[][] = [];
  for (const d of days) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1] === d - 1) run.push(d);
    else runs.push([d]);
  }
  return runs.map((r) => (r.length >= 3 ? `${SHORT_DAYS[r[0]]}–${SHORT_DAYS[r[r.length - 1]]}` : r.map((d) => SHORT_DAYS[d]).join(", "))).join(", ");
}

/** The one-line summary on Settings' section list: "Mon–Fri · 09:00–18:00", or "Mon–Fri · hours vary". */
export function hoursSummary(week: readonly (readonly Segment[])[]): string {
  const working = week.map((segs, d) => (segs.length > 0 ? d : -1)).filter((d) => d >= 0);
  if (working.length === 0) return "No working days";
  const labels = new Set(working.map((d) => segmentsLabel(week[d])));
  return `${daysLabel(working)} · ${labels.size === 1 ? [...labels][0] : "hours vary"}`;
}

/** "15% · 1h 20m held back on a 9h day" — the live preview under the buffer slider. */
export function bufferPreview(pct: number, workMinutes: number): string {
  const held = Math.round((workMinutes * pct) / 100 / 5) * 5;
  return `${pct}% · ${formatMinutes(held)} held back on a ${formatMinutes(workMinutes)} day`;
}

/** The longest working day of the week, its segments joined and summed, for the preview; 9 h when none. */
export function longestDayMinutes(week: readonly (readonly Segment[])[]): number {
  const lengths = week.map((segs) => mergeSegments(segs).reduce((sum, s) => sum + (segmentMinutes(s) ?? 0), 0));
  return Math.max(0, ...lengths) || 540;
}

/** The day can roll over between midnight and 06:00 (DECISIONS.md engineering rulings). */
export const ROLLOVER_HOURS = [0, 1, 2, 3, 4, 5, 6] as const;

export function rolloverLabel(hour: number): string {
  return hour === 0 ? "Midnight" : `${String(hour).padStart(2, "0")}:00`;
}

/**
 * Time zones the browser knows, by their current names (Chromium still lists Asia/Calcutta, so Asia/Kolkata could
 * not be picked again once left), with UTC always there and the saved one first when it is not in the list.
 */
export function timeZoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = ["UTC", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney"];
  const named = [...new Set([...zones.map(canonicalZone), "UTC"])].sort((a, b) => a.localeCompare(b));
  return named.includes(current) ? named : [current, ...named];
}

/**
 * Old names that browsers still report for zones that were renamed (IANA links). Chrome in India says
 * Asia/Calcutta for an account saved as Asia/Kolkata: the same zone, so no hint. Browsers stopped
 * canonicalising these in Intl, so the common ones are listed here.
 */
const ZONE_LINKS: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Dacca": "Asia/Dhaka",
  "Asia/Thimbu": "Asia/Thimphu",
  "Asia/Ulan_Bator": "Asia/Ulaanbaatar",
  "Asia/Ujung_Pandang": "Asia/Makassar",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Godthab": "America/Nuuk",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Truk": "Pacific/Chuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Etc/UTC": "UTC",
  "Etc/GMT": "UTC",
  GMT: "UTC",
};
export const canonicalZone = (zone: string) => ZONE_LINKS[zone] ?? zone;

/** "Detected Europe/London" when the device is in a different zone from the saved one; null otherwise. */
export function timeZoneHint(current: string, detected: string | null): string | null {
  return detected && canonicalZone(detected) !== canonicalZone(current) ? `Detected ${detected}` : null;
}
