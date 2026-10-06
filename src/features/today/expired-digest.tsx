"use client";
// Today's expired digest (PRODUCT_SPEC.md §8.2 rule 5; SCREENS.md §19 inline
// banner): once after a rollover drops time-sensitive tasks, one quiet line —
// "2 time-sensitive tasks expired overnight" — with Review (the Logbook,
// filtered to them, each one restorable) and a dismiss. Never red, never a
// push, nothing when none expired. A lazy island: not in Today's first
// download.
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@/data/powersync";
import { useAnnouncement } from "@/features/rollover/use-announcement";
import { buttonClass, iconButtonClass } from "@/ui/button";
import { Icon } from "@/ui/icons";

const EXPIRED_SQL = `select expired_at from tasks where deleted_at is null and state = 'dropped' and expired_at is not null`;

export function ExpiredDigest() {
  const { data } = useQuery<{ expired_at: string | null }>(EXPIRED_SQL);
  const stamps = useMemo(() => (data ?? []).map((r) => r.expired_at), [data]);
  const { count, dismiss } = useAnnouncement("expired", stamps);
  if (count === 0) return null;
  return (
    <p role="status" className="flex items-center gap-1 rounded-xl border border-line bg-surface py-1 pr-1 pl-4 text-body-sm text-ink-2">
      <span className="min-w-0 flex-1 text-pretty">{count === 1 ? "1 time-sensitive task" : `${count} time-sensitive tasks`} expired overnight</span>
      <Link href="/logbook?show=expired" onClick={dismiss} className={buttonClass({ variant: "link", size: "compact" })}>
        Review
      </Link>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className={iconButtonClass({ size: "compact" })}>
        <Icon name="close" size={14} />
      </button>
    </p>
  );
}
