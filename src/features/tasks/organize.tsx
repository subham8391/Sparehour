"use client";
// Organising from anywhere (SCREENS.md §24 `#`, `@`, `M`; §10 the detail's ⋯ Duplicate and Copy link; §9 the
// project's ⋯ Duplicate): the keyboard, the palette, a row's ⋯ and the detail's ⋯ ask through here, and an island
// draws the pickers, runs the writes and says what happened (organize-island.tsx). The shell carries only this
// request line and the island's mount; a request made before the island has loaded waits for it.
import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { useIdleMount } from "@/features/shell/preload-on-idle";

export type OrganizeRequest =
  /** `#` (projects) or `M` (projects and areas): one choice moves every task, one undo. */
  | { kind: "move"; ids: readonly string[]; areas?: boolean }
  | { kind: "tag"; ids: readonly string[] }
  | { kind: "duplicate"; id: string }
  | { kind: "duplicate-project"; id: string }
  /** A quiet line with no undo: "Link copied". */
  | { kind: "notice"; text: string };

type Handler = (request: OrganizeRequest) => void;
let handler: Handler | null = null;
let queue: OrganizeRequest[] = [];
const listeners = new Set<() => void>();

/** The island takes the requests while it is mounted, the waiting ones first; returns the way to stop. */
export function onOrganize(h: Handler): () => void {
  handler = h;
  const waiting = queue;
  queue = [];
  waiting.forEach(h);
  return () => {
    if (handler === h) handler = null;
  };
}

export function requestOrganize(request: OrganizeRequest): void {
  if (handler) return handler(request);
  queue.push(request);
  listeners.forEach((l) => l());
}

/** `<origin>/today?task=<id>`: Today with the task's detail open, on any device signed in (DECISIONS.md "Copy link"). */
export const taskLink = (id: string, origin = location.origin): string => `${origin}/today?task=${encodeURIComponent(id)}`;

/** Written at once, inside the tap or key that asked: a browser only lets a page write the clipboard then. */
export async function copyTaskLink(id: string): Promise<void> {
  let text = "Link copied";
  try {
    await navigator.clipboard.writeText(taskLink(id));
  } catch {
    text = "Couldn’t copy — the browser didn’t allow it.";
  }
  requestOrganize({ kind: "notice", text });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const waiting = () => queue.length > 0;

const load = () => import("./organize-island");
const Island = dynamic(() => load().then((m) => m.OrganizeIsland), { ssr: false });

/** Mounted once by the shell: fetched in idle time, or at once when something asks first. */
export function OrganizeHost() {
  const needed = useSyncExternalStore(subscribe, waiting, () => false);
  return useIdleMount(load, needed) ? <Island /> : null;
}
