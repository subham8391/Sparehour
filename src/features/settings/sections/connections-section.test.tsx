// @vitest-environment jsdom
// Settings › Connected apps: the address to give Claude with a copy button, each app with what it may do and
// Disconnect, the change and the disconnect sent to /api/connections, and a calm line when the server is out of reach.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettingsFormProps } from "../types";
import { ConnectionsSection } from "./connections-section";

const APPS = { apps: [{ clientId: "c-claude", name: "Claude", access: "write", connectedAt: "2026-10-23T08:00:00Z" }], endpoint: "https://sparehour.test/api/mcp", available: true };

function mockFetch(get: unknown = APPS, ok = true) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return new Response(JSON.stringify(get), { status: ok ? 200 : 500 });
    return new Response(JSON.stringify({}), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ConnectionsSection", () => {
  it("shows the address to connect with and each app with what it may do", async () => {
    mockFetch();
    render(<ConnectionsSection {...({} as SettingsFormProps)} />);
    expect(await screen.findByText("https://sparehour.test/api/mcp")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", { name: "What Claude may do" });
    expect(within(group).getByRole("radio", { name: "Read and change" })).toBeChecked();
  });

  it("switches an app to read only and disconnects it through the route", async () => {
    const fetchMock = mockFetch();
    render(<ConnectionsSection {...({} as SettingsFormProps)} />);
    await userEvent.click(await screen.findByRole("radio", { name: "Read only" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/connections", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ clientId: "c-claude", access: "read" }) })));
    expect(screen.getByRole("radio", { name: "Read only" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.queryByText("Claude")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/connections?clientId=c-claude", { method: "DELETE" });
    expect(screen.getByText("No apps connected yet.")).toBeInTheDocument();
  });

  it("says when it cannot reach the server, and when connecting is not switched on there", async () => {
    mockFetch(APPS, false);
    const { unmount } = render(<ConnectionsSection {...({} as SettingsFormProps)} />);
    expect(await screen.findByText("Connected apps need a connection to the internet.")).toBeInTheDocument();
    unmount();
    mockFetch({ apps: [], endpoint: "https://sparehour.test/api/mcp", available: false });
    render(<ConnectionsSection {...({} as SettingsFormProps)} />);
    expect(await screen.findByText("Connecting apps isn’t switched on for this server yet.")).toBeInTheDocument();
  });
});
