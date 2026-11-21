// Where the app starts: the first run before anything else, then the view chosen in Settings › Planning, and nothing
// decided until the settings row is on the phone.
import { FIRST_RUN_SINCE } from "@/features/shell/first-run";
import { startRoute } from "./start-rule";

const NEW = `${FIRST_RUN_SINCE}T09:00:00Z`;
const done = { onboarded_at: "2026-11-20T09:05:00Z", created_at: NEW };

describe("startRoute", () => {
  it("says nothing until the settings row has reached the phone: an empty copy is not a new account", () => {
    expect(startRoute(undefined)).toBeNull();
    expect(startRoute(null)).toBeNull();
  });

  it("sends an account that has not finished its first run to /welcome, whatever it opens to", () => {
    expect(startRoute({ onboarded_at: null, created_at: NEW, default_view: "today" })).toBe("/welcome");
    expect(startRoute({ onboarded_at: null, created_at: NEW, default_view: "inbox" })).toBe("/welcome");
  });

  it("never shows the first run to an account made before it existed", () => {
    expect(startRoute({ onboarded_at: null, created_at: "2026-09-14 02:59:30.807597Z", default_view: null })).toBe("/");
  });

  it("opens to the chosen view: Today is the first tab, Upcoming is the Week tab", () => {
    expect(startRoute({ ...done, default_view: "today" })).toBe("/");
    expect(startRoute({ ...done, default_view: "inbox" })).toBe("/inbox");
    expect(startRoute({ ...done, default_view: "upcoming" })).toBe("/week");
  });

  it("opens to Today when nothing, or nothing it knows, was chosen", () => {
    expect(startRoute({ ...done, default_view: null })).toBe("/");
    expect(startRoute({ ...done, default_view: "someday" })).toBe("/");
  });
});
