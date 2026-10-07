"use client";
// The desktop sidebar (SCREENS.md §1, DESIGN_SYSTEM.md §5 "Navigation") and
// its 56 px icon-rail form for the narrow band. Presentational: everything it
// shows arrives as props, so it renders the same in a test as in the app.
// It is viewport-high and sticky; the list scrolls inside it so the footer
// with Settings and the sync state is always in reach. From the medium band
// Cmd+\ or its button folds the full sidebar to the rail (panes.ts); the shell
// draws both and `data-sidebar` on <html> picks one, so nothing flashes.
import Link from "next/link";
import { useState } from "react";
import { iconButtonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Mark } from "@/ui/brand";
import { Icon, type IconName } from "@/ui/icons";
import { EYEBROW } from "@/ui/section-label";
import { SIDEBAR_VIEWS, VIEWS, countLabel, isActive, type NavCounts, type NavView, type ViewId } from "./nav";
import { toggleSidebar } from "./panes";
import { SyncChip, type SyncChipModel } from "./sync-chip";

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

export interface NavProject {
  id: string;
  name: string;
}
export interface NavArea {
  id: string;
  name: string;
  projects: NavProject[];
  /** The trailing "Projects" group for projects without an area: a heading, with no page behind it. */
  loose?: boolean;
}

// One item look for views, areas and projects: 36 px, radius 10, ink text with the icon a step quieter.
// Weight is set per use (views and areas medium, projects regular) so no two weights sit on one element.
const ITEM = "flex h-9 touch:h-11 items-center gap-3 rounded-lg px-3 text-body text-ink transition-colors dur-fast hover:bg-hover active:bg-press";
// The active pill: surface lifted by the 1 px ring shadow.
const ACTIVE = "bg-surface shadow-nav";
const RAIL_ITEM = "size-9 touch:size-11 justify-center px-0";

function NavItem({ view, pathname, count, rail, icon }: { view: NavView; pathname: string; count?: number; rail: boolean; icon: IconName }) {
  const active = isActive(pathname, view.href);
  const label = countLabel(count);
  return (
    <Link
      href={view.href}
      aria-current={active ? "page" : undefined}
      // The rail's name with its count, which a long-press on touch shows beside it (nav-drag-island.tsx; globals.css
      // keeps the iOS link callout and text selection from covering it).
      aria-label={rail ? (label ? `${view.label}, ${label}` : view.label) : undefined}
      title={rail ? view.label : undefined}
      className={cx(ITEM, "font-medium", active && ACTIVE, rail && RAIL_ITEM)}
    >
      <Icon name={icon} size={18} className={cx("shrink-0", active ? "text-ink" : "text-ink-2")} />
      {!rail && <span className="truncate">{view.label}</span>}
      {!rail && label && (
        <span className={cx("ml-auto text-body-sm num", active ? "font-semibold text-ink-2" : "text-ink-3")} aria-label={`${label} ${view.id === "inbox" ? "to triage" : "remaining"}`}>
          {label}
        </span>
      )}
    </Link>
  );
}

function AreaGroup({ area, pathname }: { area: NavArea; pathname: string }) {
  const [open, setOpen] = useState(true);
  const activeArea = !area.loose && isActive(pathname, `/area/${area.id}`);
  return (
    <li>
      {/* `data-nav-area` / `data-nav-project`: the rows the drag island (nav-drag.ts) makes draggable and drop targets. */}
      <div data-nav-area={area.id} className={cx(ITEM, "font-medium", activeArea && ACTIVE)}>
        {/* A 28 px target whose chevron is centred on the icon column, so the area name lines up with the view names. */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${area.name}`}
          className="-mr-1 -ml-1.5 flex size-7 touch:size-11 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors dur-fast hover:bg-hover hover:text-ink"
        >
          <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
        </button>
        {area.loose ? (
          // Projects without an area: there is no area page to go to, so the group's name is plain text.
          <span className="min-w-0 flex-1 truncate">{area.name}</span>
        ) : (
          // The row is what drags, so the link inside it does not start a link drag of its own.
          <Link href={`/area/${area.id}`} draggable={false} aria-current={activeArea ? "page" : undefined} className="min-w-0 flex-1 truncate touch:leading-11">
            {area.name}
          </Link>
        )}
      </div>
      {open && area.projects.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {area.projects.map((p) => {
            const active = isActive(pathname, `/project/${p.id}`);
            return (
              <li key={p.id}>
                <Link href={`/project/${p.id}`} data-nav-project={p.id} aria-current={active ? "page" : undefined} className={cx(ITEM, "pl-4", active && ACTIVE)}>
                  {/* The dot sits in the icon column, a step in from the area's chevron, so project names read as nested. */}
                  <span className="flex size-4.5 shrink-0 items-center justify-center" aria-hidden="true">
                    <span className="size-1.5 rounded-full bg-line-control" />
                  </span>
                  <span className="truncate">{p.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** Collapse sidebar / Expand sidebar (Cmd+\): one in each nav, the shell shows one nav at a time. */
function SidebarToggle({ rail }: { rail: boolean }) {
  const name = `${rail ? "Expand" : "Collapse"} sidebar`;
  return (
    // panes.ts finds it by its name to move focus across when the navs swap.
    <button type="button" aria-label={name} title={name} onClick={toggleSidebar} className={cx(iconButtonClass(), rail ? "hidden md:flex" : "ml-auto")}>
      <Icon name="menu" size={18} />
    </button>
  );
}

export function Sidebar({
  pathname,
  counts,
  areas,
  sync,
  rail = false,
  className = "",
}: {
  pathname: string;
  counts: NavCounts;
  areas: NavArea[];
  sync: SyncChipModel;
  rail?: boolean;
  className?: string;
}) {
  return (
    <nav
      aria-label="Main"
      data-variant={rail ? "rail" : "full"}
      className={cx("sticky top-0 h-dvh shrink-0 flex-col border-r border-line bg-paper", rail ? "w-14 items-center" : "w-66", className)}
    >
      <div className={cx("flex h-16 shrink-0 items-center", rail ? "justify-center" : "pr-3 pl-6")}>
        <Link href="/today" aria-label="Sparehour — Today" className="flex items-center gap-2.5 rounded-lg touch:min-h-11 touch:min-w-11 touch:justify-center">
          <Mark size={22} />
          {!rail && <span className="font-display text-pane font-medium leading-none text-ink">Sparehour</span>}
        </Link>
        {!rail && <SidebarToggle rail={false} />}
      </div>

      <div className={cx("min-h-0 flex-1 overflow-y-auto pb-4", rail ? "px-2.5" : "px-3")}>
        <ul className="flex flex-col gap-0.5">
          {SIDEBAR_VIEWS.map((v) => (
            <li key={v.id}>
              <NavItem view={v} pathname={pathname} rail={rail} icon={VIEW_ICONS[v.id]} count={v.count ? counts[v.count] : undefined} />
            </li>
          ))}
          {/* The rail has no room for the areas tree, so Browse (where areas and projects live on a phone) stands in for it. */}
          {rail && (
            <li>
              <NavItem view={VIEWS.browse} pathname={pathname} rail icon={VIEW_ICONS.browse} />
            </li>
          )}
        </ul>

        {!rail && (
          <section aria-label="Areas" className="pt-5">
            <div className="flex items-center justify-between pr-1.5 pb-2 pl-3">
              <h2 className={EYEBROW}>Areas</h2>
              {/* The way to a new area on a desktop: Browse's own form, opened (SCREENS.md §12 "Add area"). */}
              <Link
                href="/browse?add=area"
                aria-label="Add area"
                title="Add area"
                className="-my-1 flex size-7 touch:size-11 items-center justify-center rounded-sm text-ink-3 transition-colors dur-fast hover:bg-hover hover:text-ink"
              >
                <Icon name="plus" size={14} />
              </Link>
            </div>
            {areas.length > 0 && (
              <ul className="flex flex-col gap-0.5">
                {areas.map((a) => (
                  <AreaGroup key={a.id} area={a} pathname={pathname} />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className={cx("flex shrink-0 flex-col gap-0.5 border-t border-line pt-2.5 pb-4", rail ? "items-center px-2.5" : "px-3")}>
        {/* The rail stands in for the folded sidebar from the medium band; in the narrow band it is all there is. */}
        {rail && <SidebarToggle rail />}
        <NavItem view={VIEWS.settings} pathname={pathname} rail={rail} icon={VIEW_ICONS.settings} />
        <SyncChip model={sync} compact={rail} />
      </div>
    </nav>
  );
}
