// Every Settings section stacked in one tree, imported statically, for the
// component and accessibility tests (the app loads each as an island).
import { AccountSection } from "@/features/settings/sections/account-section";
import { AppSection } from "@/features/settings/sections/app-section";
import { AppearanceSection } from "@/features/settings/sections/appearance-section";
import { CalendarSection } from "@/features/settings/sections/calendar-section";
import { DataSection } from "@/features/settings/sections/data-section";
import { HoursSection } from "@/features/settings/sections/hours-section";
import { NotificationsSection } from "@/features/settings/sections/notifications-section";
import { PlanningSection } from "@/features/settings/sections/planning-section";
import type { SettingsFormProps, SettingsValues } from "@/features/settings/types";

export function AllSections(p: SettingsFormProps) {
  return (
    <div>
      <AccountSection {...p} />
      <HoursSection {...p} />
      <CalendarSection {...p} />
      <NotificationsSection {...p} />
      <PlanningSection {...p} />
      <AppearanceSection {...p} />
      <DataSection {...p} />
      <AppSection {...p} />
    </div>
  );
}

const NINE_TO_SIX = [{ start: "09:00", end: "18:00" }];

export const SETTINGS_VALUES: SettingsValues = {
  timezone: "Europe/London",
  weekStart: 0,
  dayRolloverHour: 4,
  bufferPct: 15,
  defaultEstimateMin: 30,
  carryAskAfter: 3,
  autoSomedayDays: 30,
  carryReview: true,
  eveningStartsAt: "18:00",
  eveningEndsAt: "22:00",
  theme: "system",
  notifyBlockStart: true,
  notifyDeadline: true,
  notifyMorning: true,
  notifyShutdown: false,
  morningNudgeTime: "",
  shutdownNudgeTime: "",
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
  blockStartLeadMin: 0,
  badgeEnabled: true,
  defaultMissPolicy: "carry",
  defaultView: "today",
  todaySort: "manual",
  showCompleted: false,
};

/** Monday to Friday, 09:00–18:00. */
export const WORK_WEEK = [NINE_TO_SIX, NINE_TO_SIX, NINE_TO_SIX, NINE_TO_SIX, NINE_TO_SIX, [], []];
