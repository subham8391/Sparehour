"use client";
// The desktop sidebar (SCREENS.md §1, DESIGN_SYSTEM.md §5 "Navigation") and
// its 56 px icon-rail form for the narrow band. Presentational: everything it
// shows arrives as props, so it renders the same in a test as in the app.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Icon, LogoMark, type IconName } from "@/ui/icons";
import { SIDEBAR_VIEWS, VIEWS, countLabel, isActive, type NavCounts, type NavView, type ViewId } from "./nav";
import { SyncChip, type SyncChipModel } from "./sync-chip";

export const VIEW_ICONS: Record<ViewId, IconName> = {
  inbox: "inbox",
  today: "sun",
  upcoming: "calendar",
  calendar: "clock",
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
}

const ITEM = "flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink-2 hover:bg-surface hover:text-ink";
const ACTIVE = "aria-[current=page]:bg-surface aria-[current=page]:text-ink aria-[current=page]:shadow-nav";

function NavItem({ view, pathname, count, rail, icon }: { view: NavView; pathname: string; count?: number; rail: boolean; icon: IconName }) {
  const active = isActive(pathname, view.href);
  const label = countLabel(count);
  return (
    <Link
      href={view.href}
      aria-current={active ? "page" : undefined}
      aria-label={rail ? (label ? `${view.label}, ${label}` : view.label) : undefined}
      title={rail ? view.label : undefined}
      className={`${ITEM} ${ACTIVE} ${rail ? "size-9 justify-center px-0" : ""}`}
    >
      <Icon name={icon} size={18} className="shrink-0" />
      {!rail && <span className="truncate">{view.label}</span>}
      {!rail && label && (
        <span className="ml-auto font-mono text-xs text-ink-3" aria-label={`${label} ${view.id === "inbox" ? "to triage" : "remaining"}`}>
          {label}
        </span>
      )}
    </Link>
  );
}

function AreaGroup({ area, pathname }: { area: NavArea; pathname: string }) {
  const [open, setOpen] = useState(true);
  const activeArea = isActive(pathname, `/area/${area.id}`);
  return (
    <li>
      <div className={`${ITEM} pr-1 ${activeArea ? "bg-surface text-ink shadow-nav" : ""}`}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${area.name}`}
          className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 hover:text-ink"
        >
          <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
        </button>
        <Link href={`/area/${area.id}`} aria-current={activeArea ? "page" : undefined} className="min-w-0 flex-1 truncate">
          {area.name}
        </Link>
      </div>
      {open && area.projects.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {area.projects.map((p) => {
            const active = isActive(pathname, `/project/${p.id}`);
            return (
              <li key={p.id}>
                <Link href={`/project/${p.id}`} aria-current={active ? "page" : undefined} className={`${ITEM} ${ACTIVE} pl-[38px]`}>
                  <span className="size-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
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

export function Sidebar({
  pathname,
  counts,
  areas,
  sync,
  rail = false,
  className = "",
  footer,
}: {
  pathname: string;
  counts: NavCounts;
  areas: NavArea[];
  sync: SyncChipModel;
  rail?: boolean;
  className?: string;
  footer?: ReactNode;
}) {
  return (
    <nav aria-label="Main" data-variant={rail ? "rail" : "full"} className={`${rail ? "w-14 items-center" : "w-60"} shrink-0 flex-col border-r border-line bg-surface-2/60 ${className}`}>
      <div className={`flex h-14 shrink-0 items-center gap-2 ${rail ? "justify-center" : "px-4"}`}>
        <Link href="/today" aria-label="Sparehour — Today" className="flex items-center gap-2">
          <LogoMark />
          {!rail && <span className="font-display text-[21px] leading-none text-ink">Sparehour</span>}
        </Link>
      </div>

      <ul className="flex flex-col gap-0.5 px-2">
        {SIDEBAR_VIEWS.map((v) => (
          <li key={v.id}>
            <NavItem view={v} pathname={pathname} rail={rail} icon={VIEW_ICONS[v.id]} count={v.count ? counts[v.count] : undefined} />
          </li>
        ))}
      </ul>

      {!rail && areas.length > 0 && (
        <section aria-label="Areas" className="mt-5 px-2">
          <h2 className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Areas</h2>
          <ul className="flex flex-col gap-0.5">
            {areas.map((a) => (
              <AreaGroup key={a.id} area={a} pathname={pathname} />
            ))}
          </ul>
        </section>
      )}

      <div className={`mt-auto flex flex-col gap-0.5 p-2 ${rail ? "items-center" : ""}`}>
        {footer}
        <SyncChip model={sync} compact={rail} />
        <NavItem view={VIEWS.settings} pathname={pathname} rail={rail} icon={VIEW_ICONS.settings} />
      </div>
    </nav>
  );
}
