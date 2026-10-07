"use client";
// The sync chip's expanded state as a phone sheet (SCREENS.md §20 "Responsive"), opened from Browse's sync row.
import { Button } from "@/ui/button";
import { Sheet } from "@/ui/sheet";
import { SyncDetail, type SyncChipModel } from "./sync-chip";

export default function SyncSheet({ model, onClose }: { model: SyncChipModel; onClose: () => void }) {
  return (
    <Sheet label="Sync status" onClose={onClose} width="sm" align="center">
      <div className="flex flex-col px-5 pt-2 pb-5 text-body text-ink-2">
        <SyncDetail model={model} />
        <Button variant="quiet" size="sheet" className="mt-3" onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}
