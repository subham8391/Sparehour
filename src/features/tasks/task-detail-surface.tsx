"use client";
// Where the task detail appears (SCREENS.md §1, DESIGN_SYSTEM.md §4a): the context pane from the medium band, with
// its resizable edge; a right-side sheet in the narrow band; a full-height sheet with a grabber on the phone. An
// island of the shell (task-detail.tsx loads it in idle time), since nothing of it shows until a task is opened.
// Escape closes it unless a popover inside claimed the key first. The pane appears at once; the sheets slide in from
// their edge (DESIGN_SYSTEM.md §7 "Sheets"), or simply appear under reduced motion.
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { PaneResizer } from "@/features/shell/pane-resizer";
import { cx } from "@/ui/cx";
import { Grabber, Scrim, trapTab, useDialogFocus } from "@/ui/sheet-parts";
import type { FieldRequest } from "./task-detail";

export function Opening() {
  return <div className="p-5 text-body text-ink-3">Opening…</div>;
}

// The panel brings the recurrence engine with it, and its wiring the queries and repositories only an open task
// needs: a second island, fetched in idle time with this one.
const loadPanel = () => import("./task-detail-connected");
const TaskDetail = dynamic(() => loadPanel().then((m) => m.TaskDetail), { ssr: false, loading: Opening });
// The surface is itself fetched in idle time or on the first open, so it starts the panel's download at once.
void loadPanel().catch(() => undefined);

// Below `md` (900 px, globals.css): 899 px and down, the narrow band included, where the side sheet covers the list.
const OVERLAY_QUERY = "(max-width: 56.1875rem)";
const subscribeOverlay = (onChange: () => void) => {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(OVERLAY_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readOverlay = () => typeof window.matchMedia === "function" && window.matchMedia(OVERLAY_QUERY).matches;

/**
 * Below `md` the detail covers the list (a full-screen sheet on the phone, a side sheet in the narrow band), so it
 * is a modal dialog there: focus moves in, stays in, and goes back to the row on close (SCREENS.md §1 rules 5 and 6).
 * From `md` up it is a pane beside the list, and focus stays where the person is working.
 */
export function DetailSurface({ id, field, onClose }: { id: string; field: FieldRequest | null; onClose: () => void }) {
  // The pane's width is the view's own (pane-resizer.tsx): /inbox, /project/…, /today.
  const view = usePathname().split("/")[1];
  const overlay = useSyncExternalStore(subscribeOverlay, readOverlay, () => false);
  const surface = useDialogFocus<HTMLElement>(overlay);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <Scrim onClose={onClose} className="fixed z-20 md:hidden" />
      {/* From the medium band the pane's width is the view's own (--pane-w), set from its left edge. */}
      <PaneResizer key={view} view={view} label="Resize the task pane" fallback={384} band="md" />
      <aside
        ref={surface}
        aria-label="Task"
        role={overlay ? "dialog" : undefined}
        aria-modal={overlay ? true : undefined}
        tabIndex={overlay ? -1 : undefined}
        onKeyDown={overlay ? trapTab : undefined}
        className={cx(
          "fixed inset-0 z-30 flex flex-col bg-surface pt-[env(safe-area-inset-top)] outline-none",
          // The phone sheet rises from the bottom, the narrow band's from the right; the pane from `md` up just appears.
          "max-md:transition-[translate,opacity] max-md:dur-slow max-md:ease-drawer max-sm:starting:translate-y-full sm:max-md:starting:translate-x-full",
          // The narrow band's sheet keeps its content clear of a landscape phone's notch and corner (DESIGN_SYSTEM.md §4a).
          "sm:left-auto sm:w-[420px] sm:border-l sm:border-line sm:pt-0 sm:shadow-sheet sm:max-md:pr-[env(safe-area-inset-right)]",
          // Never so wide that the list beside it is squeezed out: at the medium band's narrow end the pane gives way and
          // keeps the main column about 20 rem wide whatever width was chosen (it is 576 px short of the window).
          "md:sticky md:top-0 md:inset-auto md:z-auto md:h-dvh md:w-(--pane-w,24rem) md:max-w-[calc(100vw-36rem)] md:shrink-0 md:shadow-none",
        )}
      >
        <Grabber />
        <TaskDetail key={id} id={id} field={field} onClose={onClose} />
      </aside>
    </>
  );
}
