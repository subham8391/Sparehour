// What the apps say about reminders quiet hours hold back: the line under a block, and Settings' "Held back now: …".
import { describe, expect, it } from "vitest";
import { toReminderSettings } from "@/core/notifications/quiet-hours";
import { instant } from "@/core/time";
import { heldLine, heldNote, heldNotes, remindable, reminderSettingsOf, type ComingBlock } from "./held-reminders";

// Quiet from 21:00 to 08:00, reminders five minutes before a block; London in November is on UTC.
const QUIET = toReminderSettings({ notify_block_start: 1, block_start_lead_min: 5, quiet_hours_start: "21:00:00", quiet_hours_end: "08:00:00" });
const ZONE = "Europe/London";
// A Thursday, at noon.
const NOW = instant("2026-11-26T12:00:00Z");

const block = (id: string, start: string, task: string | null, own: string | null = null): ComingBlock => ({ id, start_at: start, task_title: task, block_title: own });

describe("heldNote (the line under a block)", () => {
  it("says the reminder's own time and the quiet hours it falls in", () => {
    expect(heldNote("2026-11-27T07:30:00Z", NOW, ZONE, QUIET)).toBe("No reminder: 07:25 is inside quiet hours (21:00–08:00).");
    // As the device holds a synced row.
    expect(heldNote("2026-11-26 21:30:00+00", NOW, ZONE, QUIET)).toBe("No reminder: 21:25 is inside quiet hours (21:00–08:00).");
  });

  it("says nothing for a block whose reminder will come", () => {
    expect(heldNote("2026-11-27T13:00:00Z", NOW, ZONE, QUIET)).toBeNull();
    // The end of quiet hours is outside them: 08:05 less five minutes is 08:00.
    expect(heldNote("2026-11-27T08:05:00Z", NOW, ZONE, QUIET)).toBeNull();
  });

  it("says nothing for a block that has started, or starts this minute", () => {
    expect(heldNote("2026-11-26T07:30:00Z", NOW, ZONE, QUIET)).toBeNull();
    expect(heldNote("2026-11-27T07:30:00Z", instant("2026-11-27T07:30:00Z"), ZONE, QUIET)).toBeNull();
    expect(heldNote("2026-11-27T07:30:00Z", instant("2026-11-27T07:29:00Z"), ZONE, QUIET)).not.toBeNull();
  });

  it("says nothing with block reminders off, with no quiet hours, or before the settings are read", () => {
    expect(heldNote("2026-11-27T07:30:00Z", NOW, ZONE, { ...QUIET, blockReminders: false })).toBeNull();
    expect(heldNote("2026-11-27T07:30:00Z", NOW, ZONE, { ...QUIET, quietStart: null, quietEnd: null })).toBeNull();
    expect(heldNote("2026-11-27T07:30:00Z", NOW, ZONE, null)).toBeNull();
    expect(heldNote(null, NOW, ZONE, QUIET)).toBeNull();
  });

  it("reads the time on the person's own clock", () => {
    // 02:00 UTC is 07:30 in Kolkata.
    expect(heldNote("2026-11-27T02:00:00Z", NOW, "Asia/Kolkata", QUIET)).toBe("No reminder: 07:25 is inside quiet hours (21:00–08:00).");
  });
});

describe("heldNotes (a task's blocks)", () => {
  it("keeps the blocks with a line, each with its own", () => {
    const rows = [
      { id: "past", start_at: "2026-11-26T07:30:00Z" },
      { id: "gym", start_at: "2026-11-27T07:30:00Z" },
      { id: "lunch", start_at: "2026-11-27T13:00:00Z" },
    ];
    expect(heldNotes(rows, NOW, ZONE, QUIET)).toEqual([{ id: "gym", words: "No reminder: 07:25 is inside quiet hours (21:00–08:00)." }]);
    expect(heldNotes(rows, NOW, ZONE, null)).toEqual([]);
  });
});

describe("heldLine (Settings › Notifications, under Quiet hours)", () => {
  it("names each held reminder by its task, weekday and time, in the order they would have come", () => {
    const blocks = [block("b2", "2026-11-27T07:30:00Z", "going to gym"), block("b3", "2026-11-27T13:00:00Z", "Lunch"), block("b1", "2026-11-26T21:30:00Z", "Vitamin D3")];
    expect(heldLine(blocks, NOW, ZONE, QUIET)).toBe("Held back now: Vitamin D3 (Thu 21:25), going to gym (Fri 07:25).");
  });

  it("names three, then counts the rest", () => {
    const blocks = [
      block("b1", "2026-11-27T07:30:00Z", "A"),
      block("b2", "2026-11-27T21:30:00Z", "B"),
      block("b3", "2026-11-28T07:30:00Z", "C"),
      block("b4", "2026-11-28T21:30:00Z", "D"),
      block("b5", "2026-11-29T07:30:00Z", "E"),
    ];
    expect(heldLine(blocks, NOW, ZONE, QUIET)).toBe("Held back now: A (Fri 07:25), B (Fri 21:25), C (Sat 07:25) and 2 more.");
    expect(heldLine(blocks.slice(0, 4), NOW, ZONE, QUIET)).toBe("Held back now: A (Fri 07:25), B (Fri 21:25), C (Sat 07:25) and 1 more.");
    expect(heldLine(blocks.slice(0, 3), NOW, ZONE, QUIET)).toBe("Held back now: A (Fri 07:25), B (Fri 21:25), C (Sat 07:25).");
  });

  it("is null when nothing is held", () => {
    expect(heldLine([], NOW, ZONE, QUIET)).toBeNull();
    expect(heldLine([block("b1", "2026-11-27T13:00:00Z", "Lunch")], NOW, ZONE, QUIET)).toBeNull();
    const gym = [block("b1", "2026-11-27T07:30:00Z", "going to gym")];
    expect(heldLine(gym, NOW, ZONE, { ...QUIET, blockReminders: false })).toBeNull();
    expect(heldLine(gym, NOW, ZONE, { ...QUIET, quietStart: null, quietEnd: null })).toBeNull();
    expect(heldLine(gym, NOW, ZONE, null)).toBeNull();
  });

  it("names a block with no task by its own title, else Time block", () => {
    const blocks = [block("b1", "2026-11-27T07:30:00Z", null, "Deep work"), block("b2", "2026-11-27T21:30:00Z", null, null), block("b3", "2026-11-28T07:30:00Z", null, "  ")];
    expect(heldLine(blocks, NOW, ZONE, QUIET)).toBe("Held back now: Deep work (Fri 07:25), Time block (Fri 21:25), Time block (Sat 07:25).");
  });

  it("leaves out a block that has started, and one more than seven days away", () => {
    const blocks = [
      block("started", "2026-11-26T07:30:00Z", "This morning"),
      block("now", "2026-11-26T12:00:00Z", "Starting now"),
      block("week", "2026-12-03T07:30:00Z", "Next Thursday"),
      block("far", "2026-12-03T21:30:00Z", "Past the week"),
      block("none", null as unknown as string, "No time"),
    ];
    expect(heldLine(blocks, NOW, ZONE, QUIET)).toBe("Held back now: Next Thursday (Thu 07:25).");
  });

  it("gives the reminder's own day when the lead takes it over midnight, on the person's clock", () => {
    // Saturday 00:02, five minutes before: Friday 23:57.
    expect(heldLine([block("b1", "2026-11-28T00:02:00Z", "Night train")], NOW, ZONE, QUIET)).toBe("Held back now: Night train (Fri 23:57).");
    // 19:30 UTC on Thursday is 01:00 on Friday in Kolkata.
    expect(heldLine([block("b1", "2026-11-26T19:30:00Z", "Call home")], NOW, "Asia/Kolkata", QUIET)).toBe("Held back now: Call home (Fri 00:55).");
  });

  it("follows the settings: a later start to quiet hours lets the evening one through", () => {
    const blocks = [block("b1", "2026-11-26T21:30:00Z", "Vitamin D3"), block("b2", "2026-11-27T07:30:00Z", "going to gym")];
    const later = reminderSettingsOf({ notifyBlockStart: true, blockStartLeadMin: 5, quietHoursStart: "22:00", quietHoursEnd: "08:00" });
    expect(heldLine(blocks, NOW, ZONE, later)).toBe("Held back now: going to gym (Fri 07:25).");
  });
});

describe("reminderSettingsOf (the settings form's values, as the rule reads them)", () => {
  it("reads the switch, the lead and the two times; an empty time is no quiet hours", () => {
    expect(reminderSettingsOf({ notifyBlockStart: true, blockStartLeadMin: 5, quietHoursStart: "21:00", quietHoursEnd: "08:00" })).toEqual(QUIET);
    const none = reminderSettingsOf({ notifyBlockStart: false, blockStartLeadMin: 0, quietHoursStart: "", quietHoursEnd: "" });
    expect(none).toEqual({ blockReminders: false, leadMin: 0, quietStart: null, quietEnd: null });
  });
});

describe("remindable", () => {
  it("is a task still to be done", () => {
    expect(["inbox", "active", "someday", "done", "dropped", "archived"].filter(remindable)).toEqual(["inbox", "active"]);
  });
});
