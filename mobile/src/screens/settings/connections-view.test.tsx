// Settings › Connected apps as the phone draws it: the address for Claude, each app with what it may do and
// Disconnect, and the web's words for loading, no connection, and a change that failed.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ConnectionsView, type ConnectionsViewProps } from "./connections-view";
import { APPS, ENDPOINT } from "./settings-fixture";

const props = (over: Partial<ConnectionsViewProps> = {}): ConnectionsViewProps => ({
  state: { kind: "ready", apps: APPS, endpoint: ENDPOINT, available: true },
  busy: null,
  error: null,
  onRetry: jest.fn(),
  onShare: jest.fn(),
  onAccess: jest.fn(),
  onDisconnect: jest.fn(),
  ...over,
});

describe("<ConnectionsView>", () => {
  it("shows the address to give Claude and each app with what it may do", async () => {
    const p = props();
    await render(<ConnectionsView {...p} />);
    expect(screen.getByText("In Claude, add a custom connector with this address, then sign in here when it asks.")).toBeTruthy();
    expect(screen.getByText(ENDPOINT)).toBeTruthy();
    expect(screen.getByText("Claude")).toBeTruthy();
    expect(screen.getByText(/^Connected .*23 Oct/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Read and change" }).props.accessibilityState.checked).toBe(true);
    expect(screen.getByText("An app sees your tasks, projects and calendar busy times. Disconnecting stops it at once.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Share the address" }));
    expect(p.onShare).toHaveBeenCalledWith(ENDPOINT);
  });

  it("changes what an app may do, and disconnects it", async () => {
    const p = props();
    const view = await render(<ConnectionsView {...p} />);
    await fireEvent.press(screen.getByRole("radio", { name: "Read only" }));
    expect(p.onAccess).toHaveBeenCalledWith(APPS[0], "read");
    await fireEvent.press(screen.getByRole("button", { name: "Disconnect Claude" }));
    expect(p.onDisconnect).toHaveBeenCalledWith(APPS[0]);
    // While the change is on its way the button sleeps.
    await view.rerender(<ConnectionsView {...p} busy="c-claude" />);
    expect(screen.getByRole("button", { name: "Disconnect Claude" }).props.accessibilityState.disabled).toBe(true);
  });

  it("says so while loading, without a connection, with no apps, where the server has none, and when a change failed", async () => {
    const p = props({ state: { kind: "loading" } });
    const view = await render(<ConnectionsView {...p} />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    await view.rerender(<ConnectionsView {...p} state={{ kind: "offline" }} />);
    expect(screen.getByText("Connected apps need a connection to the internet.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
    await view.rerender(<ConnectionsView {...p} state={{ kind: "ready", apps: [], endpoint: ENDPOINT, available: true }} />);
    expect(screen.getByText("No apps connected yet.")).toBeTruthy();
    await view.rerender(<ConnectionsView {...p} state={{ kind: "ready", apps: [], endpoint: ENDPOINT, available: false }} />);
    expect(screen.getByText("Connecting apps isn’t switched on for this server yet.")).toBeTruthy();
    expect(screen.queryByText("No apps connected yet.")).toBeNull();
    await view.rerender(<ConnectionsView {...props({ error: "Couldn’t disconnect Claude. Check your connection and try again." })} />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
