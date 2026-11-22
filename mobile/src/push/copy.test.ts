// The "Reminders on this device" words on the phone: the web's own for each state, said the phone's way only where
// the web's sentence is about a browser.
import { reminderCopy } from "./copy";

describe("reminderCopy", () => {
  it("not asked yet: off, Android will ask once, Turn on", () => {
    expect(reminderCopy("default", false, true)).toEqual({ headline: "Reminders are off.", detail: "Android will ask once.", steps: [], action: "enable" });
  });

  it("allowed but not turned on here, and on: the web's words as they are", () => {
    expect(reminderCopy("granted", false, true)).toEqual({ headline: "Allowed, but not turned on here yet.", detail: null, steps: [], action: "enable" });
    expect(reminderCopy("granted", true, true)).toEqual({ headline: "Reminders are on for this device.", detail: "Block starts, deadlines and the morning nudge, unless quiet hours say otherwise.", steps: [], action: "disable" });
  });

  it("blocked: Android's settings, the web's 'can't ask again', Android's steps, nothing to press but the settings", () => {
    expect(reminderCopy("denied", false, true)).toEqual({
      headline: "Blocked in Android's settings.",
      detail: "Sparehour can't ask again — lift the block, then come back here.",
      steps: ["Open Settings → Apps → Sparehour → Notifications", "Allow notifications"],
      action: null,
    });
  });

  it("a build that can't receive pushes (Expo Go) says so and offers nothing", () => {
    expect(reminderCopy("granted", false, false)).toEqual({ headline: "Reminders aren't available in this build.", detail: "They need the installed app; Expo Go can't receive them.", steps: [], action: null });
  });

  it("no answer from Android at all", () => {
    expect(reminderCopy("unsupported", false, true)).toMatchObject({ headline: "This phone can't show reminders.", action: null });
  });
});
