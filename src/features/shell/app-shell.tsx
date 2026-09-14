"use client";
// The (app) shell: sidebar from the medium band up, a 56 px icon rail on the
// narrow band, the tab bar on phones; the view fills the rest, the task
// detail pane sits to its right when a task is open. One layout per width
// band, all present in the DOM and switched with CSS so there is no flash
// while the viewport is measured. Quick-add, selection, the keyboard layer
// and the command palette are mounted once here.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { KeyboardProvider } from "@/features/commands/keyboard-provider";
import { PaletteHost, PaletteProvider, usePalette } from "@/features/commands/palette-provider";
import { QuickAddBar, QuickAddFab, QuickAddProvider } from "@/features/quickadd/quick-add-provider";
import { SelectionProvider } from "@/features/selection/selection-provider";
import { TaskDetailPane, TaskDetailProvider } from "@/features/tasks/task-detail";
import { UndoProvider } from "@/features/undo/undo-provider";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { useNavData } from "./use-nav-data";
import { useSyncChip } from "./use-sync-chip";

function Keyboard({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return <KeyboardProvider onOpenPalette={palette.open}>{children}</KeyboardProvider>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { counts, areas } = useNavData();
  const sync = useSyncChip();
  return (
    <UndoProvider>
      <QuickAddProvider>
        <TaskDetailProvider>
          <SelectionProvider>
            <PaletteProvider>
              <Keyboard>
              <div className="flex min-h-dvh">
                <Sidebar rail pathname={pathname} counts={counts} areas={areas} sync={sync} className="hidden sm:flex md:hidden" />
                <Sidebar pathname={pathname} counts={counts} areas={areas} sync={sync} className="hidden md:flex" />
                <div className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
                  {children}
                  <QuickAddBar />
                </div>
                <TaskDetailPane />
                <TabBar pathname={pathname} counts={counts} className="sm:hidden" />
                <QuickAddFab />
              </div>
              <PaletteHost />
              </Keyboard>
            </PaletteProvider>
          </SelectionProvider>
        </TaskDetailProvider>
      </QuickAddProvider>
    </UndoProvider>
  );
}
