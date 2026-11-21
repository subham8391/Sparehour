// Step 2 as the phone draws it: what connecting reads, in the web's own words for the calendars on offer, the ways to
// connect, Skip always there, and the one line after a connection that did not happen.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CalendarStepView, type CalendarStepViewProps } from "./calendar-step-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const props = (over: Partial<CalendarStepViewProps> = {}): CalendarStepViewProps => ({ onSkip: jest.fn(), onConnect: jest.fn(), onPrivacy: jest.fn(), ...over });
const buttons = () => screen.getAllByRole("button").map((b) => b.props.accessibilityLabel);

describe("<CalendarStepView>", () => {
  it("says exactly what is read with Google alone, and offers Skip first, then Google", async () => {
    await render(<CalendarStepView {...props()} />);
    expect(screen.getByRole("header", { name: "Connect your calendar." })).toBeTruthy();
    expect(screen.getByText("Your meetings are the reason you don't have as much time as you think. We subtract them.")).toBeTruthy();
    expect(screen.getByText("We read when you're busy. Only the times, so the spare-time number is real.")).toBeTruthy();
    expect(screen.getByText("We don't see what your meetings are. No titles, no guests, no notes.")).toBeTruthy();
    expect(screen.getByText("We don't change anything. Nothing is added, moved or deleted.")).toBeTruthy();
    expect(screen.getByText("Without it, the number uses your working hours alone. Meeting names, and time blocks on your calendar, are yours to add later in Settings.")).toBeTruthy();
    expect(buttons()).toEqual(["Skip for now", "Connect Google Calendar"]);
  });

  it("with Outlook beside Google, promises only what is true of both and says what Microsoft's screen asks", async () => {
    await render(<CalendarStepView {...props({ outlook: true })} />);
    expect(screen.getByText("We keep only the times. No titles, no guests, no notes.")).toBeTruthy();
    expect(screen.queryByText(/We don't see what your meetings are/)).toBeNull();
    expect(screen.getByText("With Outlook, Microsoft’s screen asks to let Sparehour read your calendars. It has no narrower permission to ask for; the times are all we keep.")).toBeTruthy();
    expect(screen.getByText("Without it, the number uses your working hours alone. With Google Calendar, meeting names and time blocks on your calendar are yours to add later in Settings.")).toBeTruthy();
    expect(buttons()).toEqual(["Skip for now", "Connect Outlook", "Connect Google Calendar"]);
  });

  it("with Outlook alone, promises nothing more of it", async () => {
    await render(<CalendarStepView {...props({ google: false, outlook: true })} />);
    expect(screen.getByText("Without it, the number uses your working hours alone.")).toBeTruthy();
    expect(buttons()).toEqual(["Skip for now", "Connect Outlook"]);
  });

  it("hands each way on: skip, each calendar, and what we store", async () => {
    const p = props({ outlook: true });
    await render(<CalendarStepView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Connect Google Calendar" }));
    expect(p.onConnect).toHaveBeenLastCalledWith("google");
    await fireEvent.press(screen.getByRole("button", { name: "Connect Outlook" }));
    expect(p.onConnect).toHaveBeenLastCalledWith("microsoft");
    await fireEvent.press(screen.getByRole("link", { name: "What we store, in plain English" }));
    expect(p.onPrivacy).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Skip for now" }));
    expect(p.onSkip).toHaveBeenCalledTimes(1);
  });

  it("says one calm line after a connection that did not happen, and keeps the buttons", async () => {
    const view = await render(<CalendarStepView {...props({ outcome: "denied" })} />);
    expect(screen.getByText("No problem. You can connect later from Settings.")).toBeTruthy();
    expect(buttons()).toEqual(["Skip for now", "Connect Google Calendar"]);
    await view.rerender(<CalendarStepView {...props({ outcome: "error" })} />);
    expect(screen.getByText("Google didn't answer. Try again.")).toBeTruthy();
    await view.rerender(<CalendarStepView {...props({ outcome: "error", reason: "That Google account is already connected." })} />);
    expect(screen.getByText("That Google account is already connected.")).toBeTruthy();
    await view.rerender(<CalendarStepView {...props({ outcome: "no_read" })} />);
    expect(screen.getByText("Google didn't share your busy times, so nothing was connected. Try again, or skip for now.")).toBeTruthy();
  });

  it("holds the buttons while a connect is on its way", async () => {
    await render(<CalendarStepView {...props({ busy: true })} />);
    expect(screen.getAllByRole("button").map((b) => b.props.accessibilityState.disabled)).toEqual([true, true]);
  });
});
