// Browse's own rows after the areas (SCREENS.md §1 "Responsive", §22): Someday,
// Logbook, Carried over, Settings. Pure.
import { BROWSE_VIEWS, type NavView } from "@/features/shell/nav";
import { VIEW_ICONS } from "@/features/shell/sidebar";
import type { IconName } from "@/ui/icons";

export interface BrowseRow {
  id: string;
  href: string;
  label: string;
  icon: IconName;
}

/**
 * Carried over is a section of Today, not a view of its own. Today has no anchor on that section, so the row
 * opens Today, where Carried over is the first list.
 */
export const CARRIED_ROW: BrowseRow = { id: "carried", href: "/today", label: "Carried over", icon: "carry" };

export function browseRows(views: readonly NavView[] = BROWSE_VIEWS): BrowseRow[] {
  const rows: BrowseRow[] = views.map((v) => ({ id: v.id, href: v.href, label: v.label, icon: VIEW_ICONS[v.id] }));
  const settings = rows.findIndex((r) => r.id === "settings");
  rows.splice(settings === -1 ? rows.length : settings, 0, CARRIED_ROW);
  return rows;
}
