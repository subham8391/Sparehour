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

/** "15% · 1h 20m held back on a 9h day" — the live preview under the buffer slider. */
export function bufferPreview(pct: number, workMinutes: number): string {
  const held = Math.round((workMinutes * pct) / 100 / 5) * 5;
  return `${pct}% · ${formatMinutes(held)} held back on a ${formatMinutes(workMinutes)} day`;
}

/** The longest working day among the week's segments, for the preview; 9 h when none. */
export function longestDayMinutes(segments: readonly (Segment | null)[]): number {
  const lengths = segments.map((s) => (s ? (segmentMinutes(s) ?? 0) : 0));
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
