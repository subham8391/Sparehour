// Settings on the phone (ANDROID_APP_SPEC.md §9; the web's app/(app)/settings/page.tsx), wired to the phone's own
// database: the section list with the web's own one-line summaries (features/settings/sections.ts). A section is
// its own screen, pushed over this one (section.tsx). The drawing is settings-view.tsx.
import { useRouter } from "expo-router";
import { useQuery } from "@/data/powersync";
import { CALENDARS_FULL_SQL, CALENDAR_CONNECTIONS_SQL, type CalendarConnectionRow, type CalendarFullRow } from "@/data/queries/calendar";
import { sectionSummary, type SummaryInput } from "@/features/settings/sections";
import { BUILD } from "~/sync/database";
import { PHONE_SECTIONS } from "./sections";
import { SettingsView } from "./settings-view";
import { useSettings } from "./use-settings";

export function Settings() {
  const router = useRouter();
  const { values, workHours, user, motion } = useSettings();
  const { data: connections, isLoading } = useQuery<CalendarConnectionRow>(CALENDAR_CONNECTIONS_SQL);
  const { data: calendars } = useQuery<CalendarFullRow>(CALENDARS_FULL_SQL);
  const summary: SummaryInput | null = values && {
    values,
    workHours,
    email: user?.email ?? null,
    calendars: isLoading ? null : { accounts: (connections ?? []).length, busy: (calendars ?? []).filter((c) => c.read !== 0).length },
    // Reminders on this phone are not built yet, so the list says nothing about this device (as the web does where it cannot tell).
    subscribed: null,
    // Reduce motion is this phone's own choice, as it is each browser's on the web.
    motion: motion.value,
    version: BUILD,
  };
  return <SettingsView items={summary && PHONE_SECTIONS.map((s) => ({ ...s, summary: sectionSummary(s.key, summary) }))} onOpen={(key) => router.push(`/settings/${key}`)} />;
}
