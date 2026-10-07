"use client";
// Sync on a phone (ruling R4, SCREENS.md §20 "Responsive"): there is no sidebar, so Browse carries one row with the
// chip's words, and tapping it opens the expanded state as a sheet — what is waiting, Sync now, and the install steps
// when storage is not protected. From the narrow band up the sidebar's chip does this, so the row steps aside.
import dynamic from "next/dynamic";
import { useState } from "react";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { ListCard } from "@/ui/list-card";
import { useSyncModel } from "./sync-chip";

const SyncSheet = dynamic(() => import("./sync-sheet"), { ssr: false });

export function SyncRow({ className }: { className?: string }) {
  const model = useSyncModel();
  const [open, setOpen] = useState(false);
  if (!model) return null;
  return (
    <section className={cx("sm:hidden", className)}>
      <ListCard className="overflow-clip">
        <li>
          <button
            type="button"
            aria-haspopup="dialog"
            data-sync-row={model.state}
            onClick={() => setOpen(true)}
            className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-body-lg text-ink transition-colors dur-fast hover:bg-hover focus-visible:-outline-offset-2 active:bg-press"
          >
            <Icon name={model.icon} size={18} className="shrink-0 text-ink-2" />
            <span className="min-w-0 flex-1 truncate num">{model.label}</span>
            <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3" />
          </button>
        </li>
      </ListCard>
      {open && <SyncSheet model={model} onClose={() => setOpen(false)} />}
    </section>
  );
}
