// A screen's rows in the browser preview and in tests: the real frame (rows-frame.tsx) over made-up lists, with
// every write taken and dropped unless a test hands in its own. Nothing here reaches the phone's database, so a
// preview's ⋯ opens the real menu, a held press ticks rows and the bulk bar shows, and nothing is saved. Rows do
// not swipe here: the gesture is the phone's.
import type { ReactNode } from "react";
import { localDate, type LocalDate } from "@/core/time";
import { pickerDayName, pickerDays } from "@/features/tasks/picker-days";
import { snoozePresets } from "@/features/tasks/snooze";
import { Temporal } from "@/core/time";
import { weekdayName } from "@/core/time/format-day";
import { RowsFrame, type RowsWiring } from "./rows-frame";

const nothing = () => undefined;

/** Made-up wiring for the day given: the web's presets and picker days for it, two projects, two tags, no writes. */
export function previewWiring(today: LocalDate = localDate("2026-11-21"), over: Partial<RowsWiring> = {}): RowsWiring {
  const now = Temporal.Instant.from(`${today.toString()}T14:05:00Z`);
  return {
    today,
    presets: snoozePresets(now, "Europe/London", today),
    days: pickerDays(today).map((day, i) => {
      const name = pickerDayName(day, today);
      const date = `${weekdayName(day)} ${day.day}`;
      return { day, name, date: name === date ? undefined : date, readout: i === 2 ? { kind: "over" as const, min: 45, text: "45m over" } : { kind: "spare" as const, min: 150, text: "2h 30m spare" } };
    }),
    choices: {
      projects: [
        { id: "p1", name: "Website", area: "Work", areaId: "a1" },
        { id: "p2", name: "Flat move", area: "Home", areaId: "a2" },
      ],
      areaOrder: [
        { id: "a1", name: "Work" },
        { id: "a2", name: "Home" },
      ],
    },
    tags: [
      { id: "g1", name: "calls" },
      { id: "g2", name: "writing" },
    ],
    onSnooze: nothing,
    onTomorrow: nothing,
    onSomeday: nothing,
    onSkip: nothing,
    onDuplicate: nothing,
    onCopyLink: nothing,
    onMoveToDay: nothing,
    onMove: nothing,
    onTag: nothing,
    onBulk: nothing,
    onBulkComplete: nothing,
    onBulkState: nothing,
    ...over,
  };
}

export function PreviewRows({ today, wiring, children }: { today?: LocalDate; wiring?: Partial<RowsWiring>; children: ReactNode }) {
  return <RowsFrame wiring={previewWiring(today, wiring)}>{children}</RowsFrame>;
}
