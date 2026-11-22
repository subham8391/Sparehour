// Signed in to an account waiting for deletion: the day it goes and the web's words, Restore and Sign out, both
// held while one is under way, and a failure in words.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccountDeletedView } from "./account-deleted-view";

const props = (over: Partial<Parameters<typeof AccountDeletedView>[0]> = {}) => ({ day: "Tuesday 22 December 2026", busy: null, error: null, onRestore: jest.fn(), onSignOut: jest.fn(), ...over });

describe("<AccountDeletedView>", () => {
  it("says the day the account goes and offers Restore and Sign out", async () => {
    const p = props();
    await render(<AccountDeletedView {...p} />);
    expect(screen.getByRole("header", { name: "Your account will be deleted on Tuesday 22 December 2026." })).toBeTruthy();
    expect(screen.getByText(/Everything is still here until then/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Restore my account" }));
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(p.onRestore).toHaveBeenCalledTimes(1);
    expect(p.onSignOut).toHaveBeenCalledTimes(1);
  });

  it("holds both buttons while restoring, and says a failure in words", async () => {
    const p = props({ busy: "restore" });
    const view = await render(<AccountDeletedView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Restoring…" }));
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(p.onRestore).not.toHaveBeenCalled();
    expect(p.onSignOut).not.toHaveBeenCalled();
    await view.rerender(<AccountDeletedView {...props({ error: "Couldn’t restore it just now — check your connection and try again." })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("says the account is set to be deleted when the day can't be read", async () => {
    await render(<AccountDeletedView {...props({ day: null })} />);
    expect(screen.getByText("Your account is set to be deleted.")).toBeTruthy();
  });
});
