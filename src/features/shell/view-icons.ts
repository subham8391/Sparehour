// Each view's icon, apart from the sidebar that draws them (sidebar.tsx hands it on, so the web's imports are
// unchanged): the Android app's Browse lists the same rows with the same icons (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { IconName } from "@/ui/icon-paths";
import type { ViewId } from "./nav";

export const VIEW_ICONS: Record<ViewId, IconName> = {
  inbox: "inbox",
  today: "sun",
  upcoming: "calendar-week",
  calendar: "calendar",
  someday: "moon",
  logbook: "book",
  browse: "grid",
  settings: "sliders",
};
