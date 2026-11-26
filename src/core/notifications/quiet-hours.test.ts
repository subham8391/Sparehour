import { describe, expect, it } from "vitest";
import { instant, localTime } from "../time";
import { heldReminder, heldWords, inQuietHours, quietHoursLabel, toReminderSettings, type ReminderSettings } from "./quiet-hours";

const t = localTime;
const night: ReminderSettings = { blockReminders: true, leadMin: 5, quietStart: t("21:00"), quietEnd: t("08:00") };
/** A wall-clock time in Kolkata (UTC+5:30, no daylight saving) on 26 Nov 2026 as an instant. */
const at = (hm: string) => instant(`2026-11-26T${hm}:00+05:30`);

describe("inQuietHours", () => {
  it("a window that runs overnight wraps: from its start, and until its end the next morning", () => {
    expect(inQuietHours(t("21:00"), t("21:00"), t("08:00"))).toBe(true);
    expect(inQuietHours(t("23:59"), t("21:00"), t("08:00"))).toBe(true);
    expect(inQuietHours(t("00:00"), t("21:00"), t("08:00"))).toBe(true);
    expect(inQuietHours(t("07:59"), t("21:00"), t("08:00"))).toBe(true);
    expect(inQuietHours(t("08:00"), t("21:00"), t("08:00"))).toBe(false);
    expect(inQuietHours(t("20:59"), t("21:00"), t("08:00"))).toBe(false);
  });

  it("a window inside one day holds from its start up to, not at, its end", () => {
    expect(inQuietHours(t("13:00"), t("13:00"), t("14:00"))).toBe(true);
    expect(inQuietHours(t("13:59"), t("13:00"), t("14:00"))).toBe(true);
    expect(inQuietHours(t("14:00"), t("13:00"), t("14:00"))).toBe(false);
    expect(inQuietHours(t("12:59"), t("13:00"), t("14:00"))).toBe(false);
  });

  it("no quiet hours, half of them, or an empty window never hold", () => {
    expect(inQuietHours(t("03:00"), null, null)).toBe(false);
    expect(inQuietHours(t("03:00"), t("21:00"), null)).toBe(false);
    expect(inQuietHours(t("03:00"), null, t("08:00"))).toBe(false);
    expect(inQuietHours(t("03:00"), t("03:00"), t("03:00"))).toBe(false);
  });
});

describe("heldReminder", () => {
  it("is judged at the reminder's own time, the start less the lead, on the person's clock", () => {
    // 21:00 with five minutes' lead rings at 20:55, before quiet hours begin: it comes.
    expect(heldReminder(at("21:00"), "Asia/Kolkata", night)).toBeNull();
    // 21:05 rings at 21:00: held.
    expect(heldReminder(at("21:05"), "Asia/Kolkata", night)).toEqual({ at: "21:00", quiet: "21:00–08:00" });
    // The gym at 07:30 rings at 07:25: held. At 08:05 it rings at 08:00: it comes.
    expect(heldReminder(at("07:30"), "Asia/Kolkata", night)).toEqual({ at: "07:25", quiet: "21:00–08:00" });
    expect(heldReminder(at("08:05"), "Asia/Kolkata", night)).toBeNull();
  });

  it("with no lead the reminder is at the start itself", () => {
    expect(heldReminder(at("21:00"), "Asia/Kolkata", { ...night, leadMin: 0 })).toEqual({ at: "21:00", quiet: "21:00–08:00" });
    expect(heldReminder(at("08:00"), "Asia/Kolkata", { ...night, leadMin: 0 })).toBeNull();
  });

  it("the same instant is read in the person's own zone", () => {
    // 21:05 in Kolkata is 15:35 in London: nothing is held there.
    expect(heldReminder(at("21:05"), "Europe/London", night)).toBeNull();
  });

  it("nothing is held when block reminders are off, or there are no quiet hours", () => {
    expect(heldReminder(at("23:00"), "Asia/Kolkata", { ...night, blockReminders: false })).toBeNull();
    expect(heldReminder(at("23:00"), "Asia/Kolkata", { ...night, quietStart: null, quietEnd: null })).toBeNull();
    expect(heldReminder(at("23:00"), "Asia/Kolkata", { ...night, quietEnd: t("21:00") })).toBeNull();
  });

  it("says so in one sentence", () => {
    expect(heldWords({ at: "07:25", quiet: "21:00–08:00" })).toBe("No reminder: 07:25 is inside quiet hours (21:00–08:00).");
  });
});

describe("quietHoursLabel and toReminderSettings", () => {
  it("the label is the two times, or null when there are none", () => {
    expect(quietHoursLabel(night)).toBe("21:00–08:00");
    expect(quietHoursLabel({ quietStart: null, quietEnd: t("08:00") })).toBeNull();
    expect(quietHoursLabel({ quietStart: t("08:00"), quietEnd: t("08:00") })).toBeNull();
  });

  it("reads the settings row as the device and the server each hold it", () => {
    expect(toReminderSettings({ notify_block_start: 1, block_start_lead_min: 10, quiet_hours_start: "21:00:00", quiet_hours_end: "08:00" })).toEqual({
      blockReminders: true,
      leadMin: 10,
      quietStart: t("21:00"),
      quietEnd: t("08:00"),
    });
    expect(toReminderSettings({ notify_block_start: 0, quiet_hours_start: null, quiet_hours_end: null })).toEqual({ blockReminders: false, leadMin: 0, quietStart: null, quietEnd: null });
    expect(toReminderSettings({ notify_block_start: false }).blockReminders).toBe(false);
    // A row that has not arrived yet: reminders count as on (the column's default), with no quiet hours known.
    expect(toReminderSettings({})).toEqual({ blockReminders: true, leadMin: 0, quietStart: null, quietEnd: null });
  });
});
