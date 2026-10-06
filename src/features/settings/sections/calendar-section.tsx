"use client";
// Settings › Calendar (SCREENS.md §18): the connected accounts and calendars,
// in the section's card with its own "Saved".
import { CalendarSettings } from "@/features/calendar/calendar-section";
import { Section, useSavedFlash } from "../settings-ui";
import type { SettingsFormProps } from "../types";

export function CalendarSection(p: SettingsFormProps) {
  const [saved, flash] = useSavedFlash();
  if (!p.calendar) return null;
  return (
    <Section id="calendar" title="Calendar" saved={saved}>
      <CalendarSettings panel={p.calendar} onChanged={flash} />
    </Section>
  );
}
