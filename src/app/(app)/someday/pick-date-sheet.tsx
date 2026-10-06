"use client";
// "Pick a date" for a Someday task (SCREENS.md §7): a short sheet with the
// native date picker — a bottom sheet on the phone, a small dialog above it.
// Choosing a day moves the task there and closes; the move is the
// repository's, with its own undo toast.
import { localDate, type LocalDate } from "@/core/time";
import { Button } from "@/ui/button";
import { DateField } from "@/ui/date-field";
import { Sheet } from "@/ui/sheet";

export function PickDateSheet({ title, today, onPick, onClose }: { title: string; today: LocalDate; onPick: (day: LocalDate) => void; onClose: () => void }) {
  return (
    <Sheet label="Pick a date" onClose={onClose} align="center" width="sm">
      <div className="flex flex-col gap-4 px-5 pt-3 pb-5 sm:pt-5">
        <div>
          <h2 className="text-body-lg font-semibold text-ink">Pick a date</h2>
          <p className="mt-1 text-body-sm text-pretty text-ink-2">For &ldquo;{title}&rdquo;</p>
        </div>
        <DateField
          aria-label={`Pick a date for ${title}`}
          placeholder="Choose a day"
          value=""
          today={today}
          min={today.toString()}
          className="w-full"
          onChange={(e) => {
            if (!e.target.value) return;
            onPick(localDate(e.target.value));
            onClose();
          }}
        />
        <Button variant="quiet" className="ml-auto" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}
