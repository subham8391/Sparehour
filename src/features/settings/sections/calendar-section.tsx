"use client";
// Settings › Calendar (SCREENS.md §18): the connected accounts and calendars,
// in the section's card with its own "Saved". The ways out to Google's and
// Microsoft's consent are added here, in the island, not in the shell's hook.
import { CalendarSettings, withConsent } from "@/features/calendar/calendar-section";
import { Section, useSavedFlash } from "../settings-ui";
import type { SettingsFormProps } from "../types";

export function CalendarSection(p: SettingsFormProps) {
  const [saved, flash] = useSavedFlash();
  if (!p.calendar) return null;
  return (
    <Section id="calendar" title="Calendar" saved={saved}>
      <CalendarSettings panel={withConsent(p.calendar)} onChanged={flash} />
    </Section>
  );
}
