"use client";
// Triage's lazy parts (SYSTEM_DESIGN.md §11.6): the Triage all walk and the pickers stay out of the Inbox's first
// download, fetched in idle time once the Inbox has painted, or at once when asked for first.
import dynamic from "next/dynamic";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";

const loadWalk = () => import("./triage-walk");
const loadSheet = () => import("./triage-sheet");

export const TriageWalkIsland = dynamic(() => loadWalk().then((m) => m.TriageWalk), { ssr: false });
export const TriageSheetIsland = dynamic(() => loadSheet().then((m) => m.TriageSheet), { ssr: false });

/** Both, in idle time; returns the cancel. */
export const preloadTriage = (): (() => void) => preloadOnIdle(() => Promise.all([loadWalk(), loadSheet()]));
