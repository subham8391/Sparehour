"use client";
// The (app) shell: sidebar from the medium band up, a 56 px icon rail on the
// narrow band, the tab bar on phones; the view fills the rest, the task
// detail pane sits to its right when a task is open. One layout per width
// band, all present in the DOM and switched with CSS so there is no flash
// while the viewport is measured. Quick-add, selection, the keyboard layer
// and the command palette are mounted once here.
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { readStorageFull, subscribeStorageFull } from "@/data/powersync";
import { BlockingProvider } from "@/features/blocking/blocking-provider";
import { KeyboardProvider } from "@/features/commands/keyboard-provider";
import { PaletteHost, PaletteProvider, usePalette } from "@/features/commands/palette-provider";
import { PushDeepLink } from "@/features/notifications/push-deep-link";
import { useAppBadge } from "@/features/notifications/use-app-badge";
import { PwaProvider } from "@/features/pwa/pwa-provider";
import { QuickAddBar, QuickAddFab, QuickAddProvider } from "@/features/quickadd/quick-add-provider";
import { CarryReviewHost } from "@/features/rituals/carry-review-host";
import { SelectionProvider, useSelection } from "@/features/selection/selection-provider";
import { OrganizeHost } from "@/features/tasks/organize";
import { TaskDetailPane, TaskDetailProvider, useTaskDetail } from "@/features/tasks/task-detail";
import { UndoProvider } from "@/features/undo/undo-provider";
import { cx } from "@/ui/cx";
import { FabRoomContext } from "./fab-visibility";
import { FirstRunGate } from "./first-run-gate";
import { showsChrome, showsQuickAdd, showsTabBar } from "./nav";
import { OpenTo } from "./open-to";
import { useIdleMount } from "./preload-on-idle";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { useNavData } from "./use-nav-data";
import { SyncModelContext } from "./sync-chip";
import { useSyncChip } from "./use-sync-chip";

// The bulk bar only shows while rows are ticked, so it is an island (the shells' 320 KB budget): fetched once the
// browser is idle and kept mounted from then on, or mounted at the first tick if that comes sooner.
const loadBulkBar = () => import("@/features/selection/bulk-bar");
const BulkBar = dynamic(() => loadBulkBar().then((m) => m.BulkBar), { ssr: false });

function BulkBarIsland() {
  const { checkedIds } = useSelection();
  return useIdleMount(loadBulkBar, checkedIds.length > 0) ? <BulkBar /> : null;
}

// Dragging areas, projects and task rows in the sidebar's tree is a pointer nicety with a tap path in Browse,
// so its wiring is an island too: fetched in idle time, never in a shell's first download.
const loadNavDrag = () => import("./nav-drag-island");
const SidebarDrag = dynamic(() => loadNavDrag().then((m) => m.SidebarDrag), { ssr: false });

function SidebarDragIsland({ areas }: { areas: ReturnType<typeof useNavData>["areas"] }) {
  return useIdleMount(loadNavDrag, false) ? <SidebarDrag areas={areas} /> : null;
}

// Storage full (SCREENS.md §21): the banner with Export your data loads only once the device reports it is out of room.
const StorageFull = dynamic(() => import("@/features/pwa/storage-full"), { ssr: false });

function StorageFullBanner() {
  return useSyncExternalStore(subscribeStorageFull, readStorageFull, () => false) ? <StorageFull /> : null;
}

function Keyboard({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return <KeyboardProvider onOpenPalette={palette.open}>{children}</KeyboardProvider>;
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PwaProvider>
      <UndoProvider>
        <QuickAddProvider>
          <TaskDetailProvider>
            <SelectionProvider>
              <PaletteProvider>
                <BlockingProvider>
                  <Keyboard>
                    <CarryReviewHost>
                      <Frame>{children}</Frame>
                    </CarryReviewHost>
                    <PaletteHost />
                    <PushDeepLink />
                    <OrganizeHost />
                    <OpenTo />
                    <FirstRunGate />
                  </Keyboard>
                </BlockingProvider>
              </PaletteProvider>
            </SelectionProvider>
          </TaskDetailProvider>
        </QuickAddProvider>
      </UndoProvider>
    </PwaProvider>
  );
}

// The frame proper. The root clips sideways overflow so nothing a view does
// can push the tab bar off a phone (brief P3). On a phone the page scrolls;
// from the narrow band up the column is viewport-high and the view scrolls
// inside it, with the add bar a footer beneath the region so it never covers
// a row. The tab bar steps aside on full-screen routes; the add bar and the
// FAB show only where adding a task is the job, and the FAB hides under the
// phone's detail sheet (P5, P10) and while a view that is not a task list
// asks it to (Today's Day view).
function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { counts, areas } = useNavData();
  const sync = useSyncChip();
  const detail = useTaskDetail();
  const [viewHidesFab, setViewHidesFab] = useState(false);
  useAppBadge(counts.today);
  const tabs = showsTabBar(pathname);
  const adds = showsQuickAdd(pathname);
  // The first run is the whole screen: no navigation to wander off into, nothing beside it.
  if (!showsChrome(pathname)) return <div className="flex min-h-dvh flex-col overflow-x-clip">{children}</div>;
  return (
    // A landscape phone's notch and rounded corners sit at the sides: the frame keeps the rail and the view clear of
    // them (DESIGN_SYSTEM.md §4a "Safe areas"); in portrait the side insets are zero. `data-view` picks the view's
    // own context pane width (SCREENS.md §1; the rules are pane-resizer.tsx's).
    <div data-view={pathname.split("/")[1]} className="flex min-h-dvh overflow-x-clip pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] sm:h-dvh">
      <Sidebar rail pathname={pathname} counts={counts} areas={areas} sync={sync} className="hidden sm:flex md:hidden" />
      <Sidebar pathname={pathname} counts={counts} areas={areas} sync={sync} className="hidden md:flex" />
      <SidebarDragIsland areas={areas} />
      <div
        className={cx(
          "flex min-w-0 flex-1 flex-col sm:relative sm:pb-0",
          // Room under the tab bar, and under the FAB where there is one, so the last row is never covered.
          tabs && (adds ? "pb-[calc(9rem+env(safe-area-inset-bottom))]" : "pb-[calc(3.5rem+env(safe-area-inset-bottom))]"),
        )}
      >
        {/* The view's scroll region from the narrow band up; on a phone it is simply the page. */}
        {/* The region scrolls on its own from the narrow band up, so it is focusable: a keyboard
            user can reach it and scroll a view that has nothing to focus (the Logbook). */}
        <div
          role="region"
          aria-label="Content"
          tabIndex={0}
          className="flex flex-1 flex-col focus-visible:-outline-offset-2 sm:min-h-0 sm:overflow-y-auto"
        >
          <StorageFullBanner />
          <SyncModelContext.Provider value={sync}>
            <FabRoomContext.Provider value={setViewHidesFab}>{children}</FabRoomContext.Provider>
          </SyncModelContext.Provider>
        </div>
        {adds && <QuickAddBar />}
        <BulkBarIsland />
      </div>
      <TaskDetailPane />
      {tabs && <TabBar pathname={pathname} counts={counts} sync={sync} className="sm:hidden" />}
      {adds && <QuickAddFab hidden={detail.selectedId !== null || viewHidesFab} />}
    </div>
  );
}
