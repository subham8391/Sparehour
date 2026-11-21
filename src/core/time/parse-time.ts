// A time of day as a person types it into a time box (DECISIONS.md, amendment 2026-10-23). On its own, free of any
// screen, so the web's time field (ui/time-field.tsx) and the Android app's read a typed time the same way
// (docs/mobile/ANDROID_APP_SPEC.md §4.3). Kept out of `core/time`'s index, which every shell carries.

const pad = (n: number) => String(n).padStart(2, "0");

/** "930", "9:30", "09.30", "21", "9" → "HH:MM"; null for anything that is not a time of day. */
export function parseTime(text: string): string | null {
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?$/i.exec(text.trim());
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2] ?? 0)];
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}
