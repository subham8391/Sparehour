// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AllSections, SETTINGS_VALUES, WORK_WEEK } from "@/test/settings";
import { WorkDayRow } from "./sections/hours-section";
import type { SettingsFormProps } from "./types";

function setup(over: Partial<SettingsFormProps> = {}) {
  const onChange = vi.fn();
  const onWorkHours = vi.fn();
  const onSignOut = vi.fn();
  const props: SettingsFormProps = {
    values: { ...SETTINGS_VALUES, quietHoursStart: "21:30", quietHoursEnd: "07:30" },
    workHours: WORK_WEEK,
    detectedTimeZone: "Asia/Kolkata",
    account: { name: "Dev User", email: "dev@sparehour.local" },
    onChange,
    onWorkHours,
    onSignOut,
    ...over,
  };
  render(<AllSections {...props} />);
  return { onChange, onWorkHours, onSignOut, user: userEvent.setup() };
}

describe("Settings sections", () => {
  it("shows the account, the hours and the buffer preview", () => {
    setup();
    expect(screen.getByText("dev@sparehour.local")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Monday is a working day" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Saturday is a working day" })).not.toBeChecked();
    expect(screen.getByText("15% · 1h 20m held back on a 9h day")).toBeInTheDocument();
    expect(screen.getByText("Detected Asia/Kolkata — use it")).toBeInTheDocument();
  });

  it("turns a day on with the default hours, changes its end, and turns it off", async () => {
    const { user, onWorkHours } = setup();
    await user.click(screen.getByRole("checkbox", { name: "Saturday is a working day" }));
    expect(onWorkHours).toHaveBeenLastCalledWith(5, [{ start: "09:00", end: "18:00" }]);
    fireEvent.change(screen.getByLabelText("Friday end"), { target: { value: "17:00" } });
    expect(onWorkHours).toHaveBeenLastCalledWith(4, [{ start: "09:00", end: "17:00" }]);
    await user.click(screen.getByRole("checkbox", { name: "Friday is a working day" }));
    expect(onWorkHours).toHaveBeenLastCalledWith(4, []);
  });

  it("refuses a day that ends before it starts, and says so", () => {
    const { onWorkHours } = setup();
    fireEvent.change(screen.getByLabelText("Monday end"), { target: { value: "08:00" } });
    expect(onWorkHours).not.toHaveBeenCalled();
    expect(screen.getByText("The day has to end after it starts.")).toBeInTheDocument();
  });

  it("every other control saves immediately and shows Saved", async () => {
    const { user, onChange } = setup({ motion: { value: "system", onChange: vi.fn() } });
    fireEvent.change(screen.getByLabelText("Buffer for the unexpected"), { target: { value: "20" } });
    expect(onChange).toHaveBeenLastCalledWith({ bufferPct: 20 });
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("Saved"))).toBe(true);
    await user.selectOptions(screen.getByLabelText("Day starts at"), "0");
    expect(onChange).toHaveBeenLastCalledWith({ dayRolloverHour: 0 });
    fireEvent.change(screen.getByLabelText("Evening starts at"), { target: { value: "19:00" } });
    expect(onChange).toHaveBeenLastCalledWith({ eveningStartsAt: "19:00" });
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(onChange).toHaveBeenLastCalledWith({ theme: "dark" });
    await user.click(screen.getByText("Detected Asia/Kolkata — use it"));
    expect(onChange).toHaveBeenLastCalledWith({ timezone: "Asia/Kolkata" });
  });

  it("notification switches, quiet hours and the badge save as their own columns; quiet hours say they drop", async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole("switch", { name: "A time block is starting" }));
    expect(onChange).toHaveBeenLastCalledWith({ notifyBlockStart: false });
    fireEvent.change(screen.getByLabelText("Quiet hours end"), { target: { value: "08:00" } });
    expect(onChange).toHaveBeenLastCalledWith({ quietHoursEnd: "08:00" });
    await user.click(screen.getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenLastCalledWith({ quietHoursStart: null, quietHoursEnd: null });
    expect(screen.getByText("Anything due in these hours is dropped, not saved for the morning.")).toBeInTheDocument();
    const badge = screen.getByRole("switch", { name: "Badge on the app icon" });
    expect(badge).toBeChecked();
    await user.click(badge);
    expect(onChange).toHaveBeenLastCalledWith({ badgeEnabled: false });
    expect(screen.getByText("Never a count of what’s late.")).toBeInTheDocument();
  });

  it("Remind me offers the start or 5, 10 or 15 minutes before, and waits while block reminders are off", async () => {
    const { user, onChange } = setup();
    const lead = screen.getByLabelText("Remind me");
    expect(within(lead).getAllByRole("option").map((o) => o.textContent)).toEqual(["At the start", "5 min before", "10 min before", "15 min before"]);
    expect(lead).toHaveValue("0");
    await user.selectOptions(lead, "10");
    expect(onChange).toHaveBeenLastCalledWith({ blockStartLeadMin: 10 });
    cleanup();
    setup({ values: { ...SETTINGS_VALUES, notifyBlockStart: false } });
    expect(screen.getByLabelText("Remind me")).toBeDisabled();
  });

  it("the nudges come from working hours until a time is chosen, and go back to them", async () => {
    const { user, onChange } = setup();
    expect(screen.getByText("At the start of my day")).toBeInTheDocument();
    expect(screen.queryByLabelText("Morning nudge time")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Choose a time" })[0]);
    // The field opens on what the working hours give: Monday starts at 09:00.
    expect(onChange).toHaveBeenLastCalledWith({ morningNudgeTime: "09:00" });
    // Turning the shutdown nudge on no longer writes a fixed 17:30: it follows the hours.
    await user.click(screen.getByRole("switch", { name: "Evening shutdown nudge" }));
    expect(onChange).toHaveBeenLastCalledWith({ notifyShutdown: true });
    cleanup();

    const again = setup({ values: { ...SETTINGS_VALUES, morningNudgeTime: "07:45", notifyShutdown: true } });
    expect(screen.getByText("At 07:45")).toBeInTheDocument();
    expect(screen.getByText("30 min before I finish")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Morning nudge time"), { target: { value: "07:30" } });
    expect(again.onChange).toHaveBeenLastCalledWith({ morningNudgeTime: "07:30" });
    await again.user.click(screen.getByRole("button", { name: "Use my working hours" }));
    expect(again.onChange).toHaveBeenLastCalledWith({ morningNudgeTime: null });
  });

  it("the device row states the permission honestly and offers the one useful action", async () => {
    const onEnable = vi.fn();
    const onDisable = vi.fn();
    const onTest = vi.fn();
    const base = { subscribed: false, busy: false, error: null, onEnable, onDisable, onTest, testResult: null };
    const { user } = setup({ notifications: { ...base, copy: { headline: "Reminders are off.", detail: "Your browser will ask once.", steps: [], action: "enable" } } });
    expect(screen.getByText("Reminders are off.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn on reminders" }));
    expect(onEnable).toHaveBeenCalled();
    cleanup();

    setup({ notifications: { ...base, subscribed: true, testResult: "Sent to 2 devices.", copy: { headline: "Reminders are on for this device.", detail: null, steps: [], action: "disable" } } });
    await user.click(screen.getByRole("button", { name: "Send a test" }));
    expect(onTest).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(onDisable).toHaveBeenCalled();
    expect(screen.getByText("Sent to 2 devices.")).toBeInTheDocument();
    cleanup();

    setup({ notifications: { ...base, copy: { headline: "Blocked in your browser.", detail: null, steps: ["Click the icon left of the address bar", "Notifications → Allow"], action: null } } });
    expect(screen.queryByRole("button", { name: "Turn on reminders" })).not.toBeInTheDocument();
    expect(screen.getByText("Notifications → Allow")).toBeInTheDocument();
  });

  it("the Data section exports in three formats and reports the file it saved", async () => {
    const onExport = vi.fn();
    const { user } = setup({ data: { onExport, busy: null, error: null, lastFile: "sparehour-export-2026-09-14.json" } });
    await user.click(screen.getByRole("button", { name: "Markdown" }));
    expect(onExport).toHaveBeenCalledWith("markdown");
    await user.click(screen.getByRole("button", { name: "CSV" }));
    expect(onExport).toHaveBeenLastCalledWith("csv");
    expect(screen.getByText("Saved sparehour-export-2026-09-14.json")).toBeInTheDocument();
    cleanup();
    setup({ data: { onExport, busy: "json", error: null, lastFile: null } });
    expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "CSV" })).toBeDisabled();
  });

  it("the morning review switch saves its own column and says so", async () => {
    const { user, onChange } = setup();
    const row = screen.getByRole("switch", { name: "Morning review" });
    expect(row).toBeChecked();
    expect(screen.getByText("Ask about carried-over tasks when the day starts")).toBeInTheDocument();
    await user.click(row);
    expect(onChange).toHaveBeenLastCalledWith({ carryReview: false });
    expect(screen.getAllByRole("status").some((s) => s.textContent?.includes("Saved"))).toBe(true);
  });

  it("Planning sets what a missed new task does and where the app opens", async () => {
    const { user, onChange } = setup();
    const miss = screen.getByRole("radiogroup", { name: "Default if missed" });
    expect(within(miss).getByRole("radio", { name: "Carry" })).toBeChecked();
    expect(screen.getByText(/A new task that misses its day moves to the next one\. Repeating tasks skip\./)).toBeInTheDocument();
    await user.click(within(miss).getByRole("radio", { name: "Expire" }));
    expect(onChange).toHaveBeenLastCalledWith({ defaultMissPolicy: "expire" });
    const open = screen.getByRole("radiogroup", { name: "Open to" });
    expect(within(open).getByRole("radio", { name: "Today" })).toBeChecked();
    await user.click(within(open).getByRole("radio", { name: "Inbox" }));
    expect(onChange).toHaveBeenLastCalledWith({ defaultView: "inbox" });
  });

  it("Planning sets Today's sort and Show completed, the same values as Today's ⋯", async () => {
    const { user, onChange } = setup();
    const sort = screen.getByRole("combobox", { name: "Sort Today by" });
    expect(sort).toHaveValue("manual");
    expect([...(sort as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Manual", "Time", "Priority", "Deadline", "Estimate"]);
    await user.selectOptions(sort, "deadline");
    expect(onChange).toHaveBeenLastCalledWith({ todaySort: "deadline" });
    const done = screen.getByRole("switch", { name: "Show completed on Today" });
    expect(done).not.toBeChecked();
    await user.click(done);
    expect(onChange).toHaveBeenLastCalledWith({ showCompleted: true });
  });

  it("Appearance offers System or Reduce for motion, kept on this device", async () => {
    const onMotion = vi.fn();
    const { user, onChange } = setup({ motion: { value: "system", onChange: onMotion } });
    const motion = screen.getByRole("radiogroup", { name: "Motion" });
    expect(within(motion).getByRole("radio", { name: "System" })).toBeChecked();
    expect(screen.getByText("Follows this device’s setting")).toBeInTheDocument();
    await user.click(within(motion).getByRole("radio", { name: "Reduce" }));
    expect(onMotion).toHaveBeenCalledWith("reduce");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("numbers stay inside their range", async () => {
    const { user, onChange } = setup();
    const estimate = screen.getByLabelText("Default estimate");
    await user.clear(estimate);
    await user.type(estimate, "45");
    expect(onChange).toHaveBeenLastCalledWith({ defaultEstimateMin: 45 });
    await user.clear(estimate);
    await user.type(estimate, "2");
    expect(onChange).not.toHaveBeenCalledWith({ defaultEstimateMin: 2 });
  });

  it("the App section shows install coaching, the storage state and the version", async () => {
    const onInstall = vi.fn();
    const { user } = setup({ app: { install: { kind: "coach-ios", steps: ["Tap Share in Safari", "Choose “Add to Home Screen”"] }, persistence: "unprotected", version: "dev", onInstall } });
    expect(screen.getByText("Tap Share in Safari")).toBeInTheDocument();
    expect(screen.getByText(/Not protected — install the app/)).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install Sparehour" })).not.toBeInTheDocument();
    // where the browser can prompt, a button
    setup({ app: { install: { kind: "prompt" }, persistence: "protected", version: "dev", onInstall } });
    await user.click(screen.getByRole("button", { name: "Install Sparehour" }));
    expect(onInstall).toHaveBeenCalled();
    expect(screen.getByText(/protected from automatic cleanup/)).toBeInTheDocument();
  });

  it("signs out", async () => {
    const { user, onSignOut } = setup();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalled();
  });

  it("with changes not yet synced, says how many would be lost and lets the person choose", async () => {
    const onSignOutAnyway = vi.fn();
    const onStaySignedIn = vi.fn();
    const { user } = setup({ unsynced: 2, onSignOutAnyway, onStaySignedIn });
    expect(screen.getByRole("alert")).toHaveTextContent("2 changes haven’t reached your account yet. Signing out now loses them.");
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(onStaySignedIn).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sign out and lose them" }));
    expect(onSignOutAnyway).toHaveBeenCalled();
  });
});

describe("<WorkDayRow>: several stretches a day", () => {
  function day(segments: { start: string; end: string }[]) {
    const onChange = vi.fn();
    const view = render(<WorkDayRow name="Monday" segments={segments} onChange={onChange} />);
    return { onChange, user: userEvent.setup(), view };
  }

  it("adds a second and a third stretch after the last, then no more, and saves the whole day each time", async () => {
    const { onChange, user, view } = day([{ start: "09:00", end: "12:30" }]);
    await user.click(screen.getByRole("button", { name: "Add hours" }));
    expect(onChange).toHaveBeenLastCalledWith([
      { start: "09:00", end: "12:30" },
      { start: "13:30", end: "14:30" },
    ]);
    view.rerender(
      <WorkDayRow
        name="Monday"
        segments={[
          { start: "09:00", end: "12:30" },
          { start: "13:30", end: "14:30" },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Monday end 2"), { target: { value: "18:00" } });
    expect(onChange).toHaveBeenLastCalledWith([
      { start: "09:00", end: "12:30" },
      { start: "13:30", end: "18:00" },
    ]);
    await user.click(screen.getByRole("button", { name: "Add hours" }));
    expect(onChange).toHaveBeenLastCalledWith([
      { start: "09:00", end: "12:30" },
      { start: "13:30", end: "18:00" },
      { start: "19:00", end: "20:00" },
    ]);
    expect(screen.queryByRole("button", { name: "Add hours" })).not.toBeInTheDocument();
  });

  it("removes any stretch; the last one left has no remove", async () => {
    const { onChange, user } = day([
      { start: "09:00", end: "12:30" },
      { start: "13:30", end: "18:00" },
    ]);
    await user.click(screen.getByRole("button", { name: "Remove Monday 09:00–12:30" }));
    expect(onChange).toHaveBeenLastCalledWith([{ start: "13:30", end: "18:00" }]);
    expect(screen.queryByRole("button", { name: /^Remove Monday/ })).not.toBeInTheDocument();
  });

  it("overlapping stretches are joined when focus leaves the day, with a note", () => {
    const { onChange, view } = day([
      { start: "09:00", end: "12:30" },
      { start: "13:30", end: "18:00" },
    ]);
    const start2 = screen.getByLabelText("Monday start 2");
    fireEvent.change(start2, { target: { value: "12:00" } });
    // While typing the overlap is kept as typed: the day already counts it as one stretch.
    expect(onChange).toHaveBeenLastCalledWith([
      { start: "09:00", end: "12:30" },
      { start: "12:00", end: "18:00" },
    ]);
    fireEvent.blur(start2, { relatedTarget: null });
    expect(onChange).toHaveBeenLastCalledWith([{ start: "09:00", end: "18:00" }]);
    expect(within(view.container).getByRole("status")).toHaveTextContent("Overlapping hours were joined: 09:00–18:00.");
  });

  it("a stretch that ends before it starts is not saved", () => {
    const { onChange } = day([
      { start: "09:00", end: "12:30" },
      { start: "13:30", end: "18:00" },
    ]);
    fireEvent.change(screen.getByLabelText("Monday end 2"), { target: { value: "13:00" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("The day has to end after it starts.")).toBeInTheDocument();
  });
});
