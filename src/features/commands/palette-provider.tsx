"use client";
// Palette state lives above the keyboard layer (which opens it) while the
// palette itself renders inside it (it runs commands): PaletteProvider holds
// open/query, PaletteHost draws it.
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useIdleMount } from "@/features/shell/preload-on-idle";
import type { PaletteScope } from "./command-runs";

interface PaletteApi {
  /** With a scope (`G P`, `G A`) the palette lists only the open projects, or the areas. */
  open: (query?: string, scope?: PaletteScope) => void;
  close: () => void;
  isOpen: boolean;
}

// The palette is an island like quick-add (CLAUDE.md: the shells stay under 320 KB): the palette and its wiring
// (queries, recents) are fetched when the browser is idle, so ⌘K opens it at once without it riding in every first
// download. Once mounted it stays mounted, as it would in the shell.
const loadPalette = () => import("./palette-host");
const PaletteIsland = dynamic(() => loadPalette().then((m) => m.PaletteHost), { ssr: false });

const PaletteContext = createContext<PaletteApi | null>(null);

export function usePalette(): PaletteApi {
  const api = useContext(PaletteContext);
  if (!api) throw new Error("usePalette needs a PaletteProvider above it");
  return api;
}

interface PaletteState {
  open: boolean;
  initialQuery: string;
  scope?: PaletteScope;
  key: number;
}

export const PaletteStateContext = createContext<PaletteState>({ open: false, initialQuery: "", key: 0 });

export function PaletteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PaletteState>({ open: false, initialQuery: "", key: 0 });
  const open = useCallback((query = "", scope?: PaletteScope) => setState((s) => ({ open: true, initialQuery: query, scope, key: s.key + 1 })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const api = useMemo(() => ({ open, close, isOpen: state.open }), [open, close, state.open]);
  return (
    <PaletteContext.Provider value={api}>
      <PaletteStateContext.Provider value={state}>{children}</PaletteStateContext.Provider>
    </PaletteContext.Provider>
  );
}

/** Renders the palette; must sit inside KeyboardProvider and PaletteProvider. */
export function PaletteHost() {
  const state = useContext(PaletteStateContext);
  return useIdleMount(loadPalette, state.open) ? <PaletteIsland /> : null;
}
