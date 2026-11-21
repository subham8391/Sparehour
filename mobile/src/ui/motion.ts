// Reduce motion on the phone (SCREENS.md §18 Appearance › Motion; the web's ../../../src/features/settings/motion.ts):
// the same per-device choice, System (the default: the phone's own accessibility setting decides) or Reduce (movement
// is cut in this app on this phone, whatever the phone says). Kept on the device like the web's copy (ui/kept.ts),
// never in the account. Everything that moves asks `useReduceMotion()`: a sheet that would slide appears in place, a
// list that would glide to a day jumps to it.
import { useSyncExternalStore } from "react";
import { AccessibilityInfo } from "react-native";
import type { MotionChoice } from "@/features/settings/settings-values";
import { kept, useKept } from "./kept";

export type { MotionChoice };

/** The web's key (MOTION_KEY in features/commands/theme.ts, which a phone cannot load: it reaches the web's commands). */
const KEY = "sparehour.motion";

const choice = kept<MotionChoice>(KEY, "system", (v) => (v === "reduce" ? "reduce" : null));

/** This phone's motion choice. */
export const motionChoice = choice.get;
/** Applies the choice at once and keeps it for the next launch. */
export const setMotionChoice = choice.set;
export const subscribeMotionChoice = choice.subscribe;
/** Resolves once this phone's copy has been read. */
export const motionChoiceReady = choice.ready;
/** For tests: forget what this run read and chose, and what the phone said. */
export function resetMotion(): void {
  choice.reset();
  systemReduces = false;
  watching = false;
}

export function useMotionChoice(): MotionChoice {
  return useKept(choice);
}

// The phone's own "Remove animations" setting, asked once and then followed as it changes.
let systemReduces = false;
let watching = false;
const systemListeners = new Set<() => void>();
function setSystem(on: boolean): void {
  if (on === systemReduces) return;
  systemReduces = on;
  systemListeners.forEach((l) => l());
}
function subscribeSystem(listener: () => void): () => void {
  if (!watching) {
    watching = true;
    try {
      void AccessibilityInfo.isReduceMotionEnabled?.()?.then(setSystem, () => undefined);
      AccessibilityInfo.addEventListener?.("reduceMotionChanged", setSystem);
    } catch {
      // Where the phone cannot be asked (the browser preview), it is taken not to mind movement.
    }
  }
  systemListeners.add(listener);
  return () => void systemListeners.delete(listener);
}
const systemNow = () => systemReduces;

/** True when movement should be cut: Reduce chosen here, or the phone's own setting while the choice is System. */
export function useReduceMotion(): boolean {
  const mine = useMotionChoice();
  const system = useSyncExternalStore(subscribeSystem, systemNow, systemNow);
  return mine === "reduce" || system;
}
