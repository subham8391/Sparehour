// Where a checklist step goes when it moves one place (SCREENS.md §10 "Checklist": Move up · Move down, the tap
// path for the grip's drag). Free of the web's screen parts, so the Android app's checklist writes the same one
// sort key (docs/mobile/ANDROID_APP_SPEC.md §4.3); checklist.tsx hands it on.
import { keyBetween } from "@/core/ordering";

/** The key that moves `id` one place up (-1) or down (+1) in `items`, or null at either end. */
export function keyForStep(items: readonly { id: string; sortKey: string | null }[], id: string, dir: -1 | 1): string | null {
  const i = items.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return null;
  const before = dir === -1 ? items[j - 1] : items[j];
  const after = dir === -1 ? items[j] : items[j + 1];
  return keyBetween(before?.sortKey ?? null, after?.sortKey ?? null);
}
