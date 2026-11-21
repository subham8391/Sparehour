// Made-up Settings, for the browser preview and the views' tests: the web's defaults for a Monday-to-Friday week,
// two calendar accounts, a connected app and two archived batches.
import { Temporal } from "@/core/time";
import type { ArchiveBatch } from "@/features/archive/batches";
import type { CalendarAccountView, CalendarView } from "@/features/calendar/calendar-views";
import type { ConnectedApp } from "@/features/settings/section-words";
import type { Segment } from "@/features/settings/settings-rules";
import type { SettingsValues } from "@/features/settings/settings-values";

export const VALUES: SettingsValues = {
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
  look: "sky",
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

const NINE_TO_SIX: Segment[] = [{ start: "09:00", end: "18:00" }];
/** Monday to Friday, 09:00–18:00; Wednesday is split around lunch. */
export const WORK_WEEK: Segment[][] = [NINE_TO_SIX, NINE_TO_SIX, [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "18:00" }], NINE_TO_SIX, NINE_TO_SIX, [], []];

export const ACCOUNTS: CalendarAccountView[] = [
  { id: "acc-g", provider: "google", email: "sam@gmail.com", status: "ok", lastSyncedAt: "2026-11-22T09:59:48Z", lastError: null, canWrite: true, titles: true, writesOwn: true },
  { id: "acc-m", provider: "microsoft", email: "sam@contoso.com", status: "needs_reauth", lastSyncedAt: "2026-11-21T08:00:00Z", lastError: null, canWrite: false, titles: false, writesOwn: false },
];
export const CALENDARS: CalendarView[] = [
  { id: "cal-1", accountId: "acc-g", summary: "Sam", color: "#4285f4", accessRole: "owner", read: true, private: false, writeTarget: true },
  { id: "cal-2", accountId: "acc-g", summary: "Holidays in the UK", color: "#0b8043", accessRole: "reader", read: false, private: false, writeTarget: false },
  { id: "cal-3", accountId: "acc-m", summary: "Calendar", color: null, accessRole: "owner", read: true, private: false, writeTarget: false },
];
/** The moment the calendar fixture is looked at: twelve seconds after the Google account last synced. */
export const CLOCK = new Date("2026-11-22T10:00:00Z");

export const APPS: ConnectedApp[] = [{ clientId: "c-claude", name: "Claude", access: "write", connectedAt: "2026-10-23T08:00:00Z" }];
export const ENDPOINT = "https://app.sparehour.example/api/mcp";

export const TODAY = Temporal.PlainDate.from("2026-11-22");
export const BATCHES: ArchiveBatch[] = [
  { key: "b2", day: Temporal.PlainDate.from("2026-11-17"), tasks: [{ id: "t1", title: "Chase the invoice" }, { id: "t2", title: "Book the dentist" }, { id: "t3", title: "Renew the passport" }] },
  { key: null, day: null, tasks: [{ id: "t4", title: "Old idea" }] },
];
