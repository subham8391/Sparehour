"use client";
// The day chip as a row draws it (day-chip.ts says which day): project, area, Search and the palette show it; Today and
// the Inbox never do, so it lives apart from the row actions every list shell carries (SYSTEM_DESIGN.md §11.6).
import { Chip } from "@/ui/chip";
import type { IconName } from "@/ui/icons";
import type { DayChip, DayChipTone } from "./day-chip";

/** A day never looks like a duration: every day chip carries a glyph the estimate does not (DESIGN_SYSTEM.md §5). */
const DAY_GLYPH: Record<DayChipTone, IconName> = { neutral: "calendar", carried: "carry", parked: "moon" };

/**
 * The day chip on rows outside Today. A task row prints the carry count
 * itself, so a row that does asks with `count={false}` and the carried chip
 * steps aside rather than saying the same thing twice.
 */
export function DayChipTag({ chip, count = true }: { chip: DayChip | null; count?: boolean }) {
  if (!chip || (chip.tone === "carried" && !count)) return null;
  return (
    <Chip tone="time" size="auto" icon={chip.label === "Inbox" ? "inbox" : DAY_GLYPH[chip.tone]} className={chip.tone === "parked" ? "text-ink-3" : undefined}>
      {chip.label}
    </Chip>
  );
}
