// A look's faces are read when the look is chosen, not as the app opens: there are 37 families and a person draws in
// one look. Sky's are loaded with the app (ui/fonts.ts). Until a newly chosen look's files are in, the text stays in
// the faces it is drawn in now (never a frame of the system's), then every text redraws at once in the new ones; the
// colours follow the choice at once, as before. On a cold start ui/fonts.ts waits for the kept look's faces behind
// the splash (`keptFacesReady`), so the first frame is already in them.
import * as Font from "expo-font";
import { useSyncExternalStore } from "react";
import { DEFAULT_LOOK } from "@/features/looks/look";
import type { FontAsset } from "./face-files";
import { fontFilesFor } from "./faces";
import { lookChoice, lookChoiceReady, subscribeLookChoice } from "./look-choice";

type Loader = (files: Record<string, FontAsset>) => Promise<void>;
const expoLoader: Loader = (files) => Font.loadAsync(files);
let loader: Loader = expoLoader;

/** The look whose faces every text is drawn in now. */
let drawn: string = DEFAULT_LOOK;
/** Looks whose files are all in. Sky's are loaded with the app. */
const ready = new Set<string>([DEFAULT_LOOK]);
const loading = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let stopFollowing: (() => void) | null = null;

function draw(look: string): void {
  if (look === drawn) return;
  drawn = look;
  listeners.forEach((l) => l());
}

const allLoaded = (files: Record<string, FontAsset>): boolean => {
  try {
    return Object.keys(files).every((name) => Font.isLoaded(name));
  } catch {
    return false;
  }
};

/**
 * Reads a look's files, once: a second call while they load, or after, waits on the same read. It never fails; a look
 * whose files could not be read is not ready, and is tried again the next time it is chosen.
 */
export function loadLookFaces(look: string): Promise<void> {
  if (ready.has(look)) return Promise.resolve();
  const pending = loading.get(look);
  if (pending) return pending;
  const files = fontFilesFor(look);
  if (allLoaded(files)) {
    ready.add(look);
    return Promise.resolve();
  }
  const read = loader(files).then(
    () => void ready.add(look),
    () => undefined,
  );
  const settled = read.finally(() => loading.delete(look));
  loading.set(look, settled);
  return settled;
}

/** Draws the chosen look's faces now if they are in, or once they are; a look that could not be read is drawn in Sky's. */
function follow(look: string): void {
  if (ready.has(look)) return draw(look);
  void loadLookFaces(look).then(() => {
    if (lookChoice() !== look) return;
    draw(ready.has(look) ? look : DEFAULT_LOOK);
  });
}

function subscribe(listener: () => void): () => void {
  if (!stopFollowing) {
    stopFollowing = subscribeLookChoice(() => follow(lookChoice()));
    follow(lookChoice());
  }
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const snapshot = (): string => drawn;

/** The look whose faces the text is drawn in: the chosen one once its files are in, the one before until then. */
export function useFaceLook(): string {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The same, outside a component. */
export const faceLook = snapshot;

/** Resolves once this phone's kept look has been read and its faces are in (or could not be read). */
export async function keptFacesReady(): Promise<void> {
  await lookChoiceReady();
  const look = lookChoice();
  await loadLookFaces(look);
  draw(ready.has(look) ? look : DEFAULT_LOOK);
}

/** For tests: forget what this run loaded, and read files with `next` (expo-font's own when left out). */
export function resetLookFaces(next?: Loader): void {
  loader = next ?? expoLoader;
  stopFollowing?.();
  stopFollowing = null;
  drawn = DEFAULT_LOOK;
  ready.clear();
  ready.add(DEFAULT_LOOK);
  loading.clear();
  listeners.clear();
}
