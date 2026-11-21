// Settings › About as the phone draws it: the version, the way to the privacy page, and the web's own changelog.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { CHANGELOG } from "@/features/settings/changelog";
import { AboutView } from "./about-view";

describe("<AboutView>", () => {
  it("shows the version and What's new as the web writes it", async () => {
    await render(<AboutView version="android-1.0.0" onPrivacy={jest.fn()} />);
    expect(screen.getByText("android-1.0.0")).toBeTruthy();
    expect(screen.getByRole("header", { name: "WHAT’S NEW" })).toBeTruthy();
    expect(screen.getByText("7 Oct 2026")).toBeTruthy();
    for (const entry of CHANGELOG) for (const item of entry.items) expect(screen.getByText(item)).toBeTruthy();
    expect(screen.queryByText("Keyboard shortcuts")).toBeNull();
  });

  it("opens the privacy page, which says where your data lives", async () => {
    const onPrivacy = jest.fn();
    await render(<AboutView version={null} onPrivacy={onPrivacy} />);
    expect(screen.getByText("Where your data lives, and what leaves this device")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Privacy" }));
    expect(onPrivacy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
