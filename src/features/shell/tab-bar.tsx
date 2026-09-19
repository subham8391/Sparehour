"use client";
// The phone tab bar (DESIGN_SYSTEM.md §5): Today · Inbox · Week · Browse,
// 24 px icons, 11 px labels, a 16 px ink badge for the inbox count, safe
// area respected. Every tab is a 56 px target; the active one is ink with a
// heavier stroke, no pill. Browse carries the sync mark on a phone, where
// there is no sidebar to hold the sync line (ruling R4).
import Link from "next/link";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { TAB_VIEWS, activeTab, countLabel, type NavCounts } from "./nav";
import { VIEW_ICONS } from "./sidebar";
import { syncAttention, type SyncChipModel } from "./sync-chip";

export function TabBar({ pathname, counts, sync, className = "" }: { pathname: string; counts: NavCounts; sync?: SyncChipModel; className?: string }) {
  const active = activeTab(pathname);
  const attention = sync ? syncAttention(sync.state) : null;
  return (
    <nav
      aria-label="Primary"
      className={cx("fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md", className)}
    >
      {TAB_VIEWS.map((v) => {
        const badge = v.count === "inbox" ? countLabel(counts.inbox) : null;
        const current = active === v.id;
        // Sync is quiet until it is not: a hollow dot offline, amber when something wants a look.
        const mark = v.id === "browse" ? attention : null;
        const name = badge ? `${v.tabLabel}, ${badge} to triage` : mark && sync ? `${v.tabLabel}, ${sync.label}` : undefined;
        return (
          <Link
            key={v.id}
            href={v.href}
            aria-current={current ? "page" : undefined}
            aria-label={name}
            className={cx(
              "relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-lg text-micro font-medium transition-colors dur-fast active:bg-press",
              current ? "text-ink" : "text-ink-3",
            )}
          >
            <Icon name={VIEW_ICONS[v.id]} size={24} strokeWidth={current ? 2 : 1.6} />
            <span>{v.tabLabel}</span>
            {badge && (
              <span aria-hidden="true" className="absolute top-1.5 left-[calc(50%+4px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-micro font-semibold text-ink-inverse num">
                {badge}
              </span>
            )}
            {mark && (
              <span
                aria-hidden="true"
                data-sync={sync?.state}
                className={cx("absolute top-2.5 left-[calc(50%+6px)] size-2 rounded-full", mark === "look" ? "bg-over-fill" : "border border-line-control bg-surface")}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
