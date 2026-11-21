// The browser preview of Settings (npm run preview, /settings): the real view, made-up data, the web's own
// summaries. A row opens its section's preview; `?state=opening` shows the list before the row is read. See
// _layout.web.tsx.
import { useLocalSearchParams, useRouter } from "expo-router";
import { sectionSummary } from "@/features/settings/sections";
import { PHONE_SECTIONS } from "~/screens/settings/sections";
import { VALUES, WORK_WEEK } from "~/screens/settings/settings-fixture";
import { SettingsView } from "~/screens/settings/settings-view";

const SUMMARY = { values: VALUES, workHours: WORK_WEEK, email: "sam@example.com", calendars: { accounts: 2, busy: 2 }, subscribed: null, motion: "system" as const, version: "android-1.0.0" };

export default function Preview() {
  const router = useRouter();
  const q = useLocalSearchParams<{ state?: string }>();
  return <SettingsView items={q.state === "opening" ? null : PHONE_SECTIONS.map((s) => ({ ...s, summary: sectionSummary(s.key, SUMMARY) }))} onOpen={(key) => router.push(`/settings/${key}`)} />;
}
