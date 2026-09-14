// The navigation model (SCREENS.md §1, DESIGN_SYSTEM.md §4a/§5): one list of
// views, two projections — the sidebar's fixed order and the phone's four
// tabs. Pure so the order and the active-state rule are unit-tested.

export type ViewId = "inbox" | "today" | "upcoming" | "calendar" | "someday" | "logbook" | "browse" | "settings";

export interface NavView {
  id: ViewId;
  href: string;
  label: string;
  /** Which of the two sidebar counts this view carries, if any (§1 "Counts"). */
  count?: "inbox" | "today";
}

export const VIEWS: Record<ViewId, NavView> = {
  inbox: { id: "inbox", href: "/inbox", label: "Inbox", count: "inbox" },
  today: { id: "today", href: "/today", label: "Today", count: "today" },
  upcoming: { id: "upcoming", href: "/upcoming", label: "Upcoming" },
  calendar: { id: "calendar", href: "/calendar", label: "Calendar" },
  someday: { id: "someday", href: "/someday", label: "Someday" },
  logbook: { id: "logbook", href: "/logbook", label: "Logbook" },
  browse: { id: "browse", href: "/browse", label: "Browse" },
  settings: { id: "settings", href: "/settings", label: "Settings" },
};

/** Sidebar order is fixed at M1 (Routines joins at M2). */
export const SIDEBAR_VIEWS: readonly NavView[] = [VIEWS.inbox, VIEWS.today, VIEWS.upcoming, VIEWS.calendar, VIEWS.someday, VIEWS.logbook];

/** Phone tab bar: Today · Inbox · Week · Browse. "Week" is Upcoming's phone name. */
export const TAB_VIEWS: readonly (NavView & { tabLabel: string })[] = [
  { ...VIEWS.today, tabLabel: "Today" },
  { ...VIEWS.inbox, tabLabel: "Inbox" },
  { ...VIEWS.upcoming, tabLabel: "Week" },
  { ...VIEWS.browse, tabLabel: "Browse" },
];

/** Browse is the phone's sidebar: what lives under it besides areas and projects. */
export const BROWSE_VIEWS: readonly NavView[] = [VIEWS.someday, VIEWS.logbook, VIEWS.settings];

/**
 * A view is active for its own path and anything nested under it, so
 * /project/abc lights Browse on the phone and nothing in the sidebar's fixed
 * list — areas and projects light their own row instead.
 */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The tab that should be lit for a pathname; Browse owns everything that is not a tab of its own. */
export function activeTab(pathname: string): ViewId | null {
  const own = TAB_VIEWS.find((v) => v.id !== "browse" && isActive(pathname, v.href));
  if (own) return own.id;
  if (["/browse", "/someday", "/logbook", "/settings", "/area", "/project", "/carried"].some((p) => isActive(pathname, p))) return "browse";
  return null;
}

export interface NavCounts {
  inbox: number;
  today: number;
}

/** A count is shown only when it is above zero; "0" in the sidebar is noise. */
export function countLabel(n: number | undefined): string | null {
  return n && n > 0 ? String(n) : null;
}
