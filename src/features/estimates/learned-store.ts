// The device's copy of how the person's estimates run (DECISIONS.md, amendment 2026-11-15). The server works it
// out from every finished task with a recorded length (`/api/estimates/learned`); the device keeps the answer and
// asks again when it is a few hours old or a new length has been recorded, so a suggestion is there offline and
// never waits on the network. Nothing here is in a shell: quick add's sheet, the task detail and Settings load it.
import type { Learned } from "@/core/estimates";

const KEY = "sparehour.learned";
/** How long an answer stands before it is asked for again. */
export const FRESH_MS = 6 * 60 * 60 * 1000;

interface Kept {
  space: string;
  /** When it was asked for (epoch ms); 0 once a new length has been recorded, so the next look asks again. */
  at: number;
  learned: Learned;
}

type Store = Pick<Storage, "getItem" | "setItem">;

function storage(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

let kept: Kept | null | undefined;
let asking: Promise<void> | null = null;
const listeners = new Set<() => void>();

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** The shape this build reads: an answer kept by an older build, or anything else, is asked for again. */
function isLearned(v: unknown): v is Learned {
  return isRecord(v) && isRecord(v.estimated) && isRecord(v.projects);
}

function read(): Kept | null {
  if (kept !== undefined) return kept;
  kept = null;
  try {
    const raw = storage()?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Kept>) : null;
    if (parsed && typeof parsed.space === "string" && typeof parsed.at === "number" && isLearned(parsed.learned)) kept = { space: parsed.space, at: parsed.at, learned: parsed.learned };
  } catch {
    // Unreadable is the same as never asked.
  }
  return kept;
}

function keep(next: Kept): void {
  kept = next;
  try {
    storage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    // A full or blocked store: the answer still stands until the page goes.
  }
  listeners.forEach((l) => l());
}

export function subscribeLearned(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** What is known for this space, however old; null until the server has answered once. */
export function learnedFor(space: string | null | undefined): Learned | null {
  const k = read();
  return k && space && k.space === space ? k.learned : null;
}

/** Asks the server when the answer is missing or old (and the device is online); a failure leaves what is kept. */
export function refreshLearned(space: string, now = Date.now(), ask: typeof fetch = fetch): Promise<void> {
  const k = read();
  if (k && k.space === space && k.at !== 0 && now - k.at < FRESH_MS) return Promise.resolve();
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve();
  asking ??= ask(`/api/estimates/learned?space=${encodeURIComponent(space)}`, { credentials: "same-origin", headers: { accept: "application/json" } })
    .then(async (res) => {
      if (!res.ok) return;
      const body = (await res.json()) as { learned?: unknown };
      if (isLearned(body.learned)) keep({ space, at: now, learned: body.learned });
    })
    .catch(() => undefined)
    .finally(() => {
      asking = null;
    });
  return asking;
}

/** A length was just recorded: what is kept still answers, and the next look asks the server again. */
export function learnedIsOld(): void {
  const k = read();
  if (k && k.at !== 0) keep({ ...k, at: 0 });
}

/** For tests: forget what this page read. */
export function resetLearned(): void {
  kept = undefined;
  asking = null;
}
