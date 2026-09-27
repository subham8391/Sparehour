// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsForm, type SettingsFormProps } from "./settings-form";

function setup(over: Partial<SettingsFormProps> = {}) {
  const onChange = vi.fn();
  const onWorkHours = vi.fn();
  const onSignOut = vi.fn();
  const props: SettingsFormProps = {
    values: {
      timezone: "Europe/London",
      weekStart: 0,
      dayRolloverHour: 4,
      bufferPct: 15,
      defaultEstimateMin: 30,
      carryAskAfter: 3,
      autoSomedayDays: 30,
      carryReview: true,
      eveningStartsAt: "18:00",
      theme: "system",
      notifyBlockStart: true,
      notifyDeadline: true,
      notifyMorning: true,
      notifyShutdown: false,
      morningNudgeTime: "08:30",
      shutdownNudgeTime: "",
      quietHoursStart: "21:30",
      quietHoursEnd: "07:30",
    },
    workHours: [{ start: "09:00", end: "18:00" }, { start: "09:00", end: "18:00" }, { start: "09:00", end: "18:00" }, { start: "09:00", end: "18:00" }, { start: "09:00", end: "18:00" }, null, null],
    detectedTimeZone: "Asia/Kolkata",
    account: { name: "Dev User", email: "dev@sparehour.local" },
    onChange,
    onWorkHours,
    onSignOut,
    ...over,
  };
  render(<SettingsForm {...props} />);
  return { onChange, onWorkHours, onSignOut, user: userEvent.setup() };
}

describe("<SettingsForm>", () => {
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
    expect(onWorkHours).toHaveBeenLastCalledWith(5, { start: "09:00", end: "18:00" });
    fireEvent.change(screen.getByLabelText("Friday end"), { target: { value: "17:00" } });
    expect(onWorkHours).toHaveBeenLastCalledWith(4, { start: "09:00", end: "17:00" });
    await user.click(screen.getByRole("checkbox", { name: "Friday is a working day" }));
    expect(onWorkHours).toHaveBeenLastCalledWith(4, null);
  });

  it("refuses a day that ends before it starts, and says so", () => {
    const { onWorkHours } = setup();
    fireEvent.change(screen.getByLabelText("Monday end"), { target: { value: "08:00" } });
    expect(onWorkHours).not.toHaveBeenCalled();
    expect(screen.getByText("The day has to end after it starts.")).toBeInTheDocument();
  });

  it("every other control saves immediately and shows Saved", async () => {
    const { user, onChange } = setup();
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

  it("notification switches, nudge times and quiet hours save as their own columns", async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole("switch", { name: "A time block is starting" }));
    expect(onChange).toHaveBeenLastCalledWith({ notifyBlockStart: false });
    fireEvent.change(screen.getByLabelText("Morning nudge time"), { target: { value: "07:45" } });
    expect(onChange).toHaveBeenLastCalledWith({ morningNudgeTime: "07:45" });
    expect(screen.getByLabelText("Shutdown nudge time")).toBeDisabled();
    await user.click(screen.getByRole("switch", { name: "Evening shutdown nudge" }));
    expect(onChange).toHaveBeenLastCalledWith({ notifyShutdown: true, shutdownNudgeTime: "17:30" });
    fireEvent.change(screen.getByLabelText("Quiet hours end"), { target: { value: "08:00" } });
    expect(onChange).toHaveBeenLastCalledWith({ quietHoursEnd: "08:00" });
    await user.click(screen.getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenLastCalledWith({ quietHoursStart: null, quietHoursEnd: null });
    expect(screen.getByText("Never a count of what’s late.")).toBeInTheDocument();
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
});
