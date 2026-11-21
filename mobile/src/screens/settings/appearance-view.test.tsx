// Settings › Appearance as the phone draws it: the web's three looks with the person's own beside them, the rest
// behind More looks; the theme; and Motion, this phone's own, in the web's words.
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { readyLooks } from "@/features/looks/catalog";
import { AppearanceView, type AppearanceViewProps } from "./appearance-view";

const props = (over: Partial<AppearanceViewProps> = {}): AppearanceViewProps => ({ look: "sky", theme: "system", motion: "system", onLook: jest.fn(), onTheme: jest.fn(), onMotion: jest.fn(), ...over });

describe("<AppearanceView>", () => {
  it("opens on Sky, Daylight and Indigo, the one in use ticked, and says how a look follows the person", async () => {
    await render(<AppearanceView {...props()} />);
    expect(screen.getAllByRole("radio").filter((r) => ["Sky", "Daylight", "Indigo"].includes(r.props.accessibilityLabel))).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "Sky" }).props.accessibilityState.checked).toBe(true);
    expect(screen.queryByRole("radio", { name: "Tide" })).toBeNull();
    expect(screen.getByText("Colours, type and shapes. Every look works the same; it follows you to every device.")).toBeTruthy();
    expect(screen.getByText("The original: calm and editorial")).toBeTruthy();
  });

  it("keeps the person's own look in sight beside the three", async () => {
    await render(<AppearanceView {...props({ look: "tide" })} />);
    expect(screen.getByRole("radio", { name: "Tide" }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole("button", { name: `More looks (${readyLooks().length - 4})` })).toBeTruthy();
  });

  it("shows the rest behind More looks, and picks one", async () => {
    const p = props();
    await render(<AppearanceView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: `More looks (${readyLooks().length - 3})` }));
    expect(screen.getByRole("button", { name: "Fewer looks" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Tide" }));
    expect(p.onLook).toHaveBeenCalledWith("tide");
    expect(screen.getByText("Saved")).toBeTruthy();
    // The look already in use is not written again.
    await fireEvent.press(screen.getByRole("radio", { name: "Sky" }));
    expect(p.onLook).toHaveBeenCalledTimes(1);
  });

  it("offers Light, Dark and System, and hands the choice on", async () => {
    const p = props();
    await render(<AppearanceView {...p} />);
    const theme = within(screen.getByLabelText("Theme"));
    expect(theme.getByRole("radio", { name: "System" }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(theme.getByRole("radio", { name: "Dark" }));
    expect(p.onTheme).toHaveBeenCalledWith("dark");
    expect(p.onMotion).not.toHaveBeenCalled();
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("offers Motion as System or Reduce, and says what each means on this phone", async () => {
    const p = props();
    const view = await render(<AppearanceView {...p} />);
    const motion = within(screen.getByLabelText("Motion"));
    expect(motion.getByRole("radio", { name: "System" }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByText("Follows this device’s setting")).toBeTruthy();
    await fireEvent.press(motion.getByRole("radio", { name: "Reduce" }));
    expect(p.onMotion).toHaveBeenCalledWith("reduce");
    expect(p.onTheme).not.toHaveBeenCalled();
    await view.rerender(<AppearanceView {...props({ motion: "reduce" })} />);
    expect(screen.getByText("Movement is cut on this device")).toBeTruthy();
  });
});
