// @vitest-environment jsdom
// The forced update's trigger (SYSTEM_DESIGN.md §10.2): /api/bootstrap is asked at start, and a min_client_version
// above this build closes the gate with "Update required"; at or below it, or for a development build, nothing
// shows. The PWA provider mounts the check once the browser is idle, so no shell carries it.
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const build = vi.hoisted(() => ({ id: "2026.10.07.1500" }));
vi.mock("@/data/build-id", () => ({
  get BUILD_ID() {
    return build.id;
  },
}));
vi.mock("@serwist/window", () => ({ Serwist: class {} }));
vi.mock("./update-required", () => ({ default: ({ min }: { min: string }) => <p role="alertdialog" aria-label="Update required">{min}</p> }));

const { default: VersionGate, moveToNewVersion } = await import("./version-gate");
const { PwaProvider } = await import("./pwa-provider");

let gate: string | null = null;
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ min_client_version: gate, server_time: "2026-10-07T16:00:00Z" })));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
  gate = null;
  build.id = "2026.10.07.1500";
});

describe("the version gate", () => {
  it("blocks with Update required when the oldest build allowed is newer than this one", async () => {
    gate = "2026.10.07.1900";
    render(<VersionGate />);
    expect(await screen.findByRole("alertdialog", { name: "Update required" })).toHaveTextContent("2026.10.07.1900");
    expect(fetchMock).toHaveBeenCalledWith("/api/bootstrap", expect.objectContaining({ cache: "no-store" }));
  });

  it("stays open at or above the gate", async () => {
    gate = "2026.10.07.1500";
    render(<VersionGate />);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("a development build never asks", async () => {
    build.id = "dev";
    gate = "9999";
    render(<VersionGate />);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("asks again when the app comes back into view, at most twice an hour", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      render(<VersionGate />);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      document.dispatchEvent(new Event("visibilitychange"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.setSystemTime(Date.now() + 31 * 60_000);
      gate = "2026.10.07.1900";
      document.dispatchEvent(new Event("visibilitychange"));
      expect(await screen.findByRole("alertdialog", { name: "Update required" })).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("moves to the new version through a waiting worker, else by reloading", async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
    try {
      const postMessage = vi.fn();
      vi.stubGlobal("navigator", { ...navigator, serviceWorker: { getRegistration: async () => ({ waiting: { postMessage } }) } });
      vi.useFakeTimers();
      await moveToNewVersion();
      expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
      expect(reload).not.toHaveBeenCalled();
      // A worker that never answers still ends in a reload.
      vi.advanceTimersByTime(4000);
      expect(reload).toHaveBeenCalledTimes(1);
      vi.useRealTimers();

      vi.stubGlobal("navigator", { ...navigator, serviceWorker: { getRegistration: async () => undefined } });
      await moveToNewVersion();
      expect(reload).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("the PWA provider mounts it once the browser is idle", async () => {
    gate = "2026.10.07.1900";
    render(
      <PwaProvider>
        <p>Today</p>
      </PwaProvider>,
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(await screen.findByRole("alertdialog", { name: "Update required" }, { timeout: 3000 })).toBeInTheDocument();
  });
});
