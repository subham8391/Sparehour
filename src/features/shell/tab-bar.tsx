"use client";
// The phone tab bar (DESIGN_SYSTEM.md §5): Today · Inbox · Week · Browse,
// 22 px icons, 10.5 px labels, a 16 px ink badge for the inbox count, safe
// area respected. Every tab is a ≥ 44 px target.
import Link from "next/link";
import { Icon } from "@/ui/icons";
import { TAB_VIEWS, activeTab, countLabel, type NavCounts } from "./nav";
import { VIEW_ICONS } from "./sidebar";

export function TabBar({ pathname, counts, className = "" }: { pathname: string; counts: NavCounts; className?: string }) {
  const active = activeTab(pathname);
  return (
    <nav aria-label="Primary" className={`fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] ${className}`}>
      {TAB_VIEWS.map((v) => {
        const badge = v.count === "inbox" ? countLabel(counts.inbox) : null;
        return (
          <Link
            key={v.id}
            href={v.href}
            aria-current={active === v.id ? "page" : undefined}
            aria-label={badge ? `${v.tabLabel}, ${badge} to triage` : undefined}
            className="relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-ink-3 aria-[current=page]:text-ink"
          >
            <Icon name={VIEW_ICONS[v.id]} size={22} />
            <span>{v.tabLabel}</span>
            {badge && (
              <span aria-hidden="true" className="absolute top-1.5 left-[calc(50%+6px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 font-mono text-[10px] font-semibold text-paper">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
