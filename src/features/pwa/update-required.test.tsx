// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let queued: number[] = [];
const db = { getUploadQueueStats: vi.fn(async () => ({ count: queued.length > 1 ? (queued.shift() as number) : (queued[0] ?? 0) })) };
vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => db }));

const { default: UpdateRequired, flushUploads, markTried, triedRecently } = await import("./update-required");

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  queued = [];
});

describe("flushUploads", () => {
  it("waits while changes are queued and resolves once none are left", async () => {
    const counts = [3, 2, 0];
    const seen: number[] = [];
    const left = await flushUploads({ getUploadQueueStats: async () => ({ count: counts.shift() ?? 0 }) } as never, { intervalMs: 1, onCount: (n) => seen.push(n) });
    expect(left).toBe(0);
    expect(seen).toEqual([3, 2, 0]);
  });

  it("goes ahead with what is left when the time is up or the device is offline — the queue survives the reload", async () => {
    const stuck = { getUploadQueueStats: async () => ({ count: 4 }) } as never;
    expect(await flushUploads(stuck, { intervalMs: 1, timeoutMs: 10 })).toBe(4);
    expect(await flushUploads(stuck, { intervalMs: 1, online: () => false })).toBe(4);
    expect(await flushUploads(null)).toBe(0);
  });
});

describe("the reload loop guard", () => {
  it("remembers a reload for the same gate for two minutes", () => {
    const m = memory();
    const now = Date.parse("2026-10-07T16:00:00Z");
    expect(triedRecently("2026.10.07.1900", m, now)).toBe(false);
    markTried("2026.10.07.1900", m, now);
    expect(triedRecently("2026.10.07.1900", m, now + 60_000)).toBe(true);
    expect(triedRecently("2026.10.08.0900", m, now + 60_000)).toBe(false);
    expect(triedRecently("2026.10.07.1900", m, now + 3 * 60_000)).toBe(false);
    expect(triedRecently("x", null)).toBe(false);
  });
});

describe("<UpdateRequired>", () => {
  it("blocks the app with Update required, lets the pending uploads go, then updates", async () => {
    queued = [2, 1, 0];
    const applyUpdate = vi.fn();
    render(
      <>
        <button type="button">Behind</button>
        <UpdateRequired min="2026.10.07.1900" applyUpdate={applyUpdate} />
      </>,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Update required" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The app behind is out of reach, and its shortcuts do not fire.
    expect(screen.getByText("Behind").closest("[inert]")).not.toBeNull();
    expect(dialog.closest("[inert]")).toBeNull();
    const onKey = vi.fn();
    window.addEventListener("keydown", onKey);
    fireEvent.keyDown(document.body, { key: "n" });
    expect(onKey).not.toHaveBeenCalled();
    window.removeEventListener("keydown", onKey);

    await vi.waitFor(() => expect(applyUpdate).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(db.getUploadQueueStats).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Updating…");
    expect(triedRecently("2026.10.07.1900", sessionStorage)).toBe(true);
  });

  it("says how many changes are still to upload while it waits", async () => {
    queued = [3, 3];
    vi.useFakeTimers();
    render(<UpdateRequired min="2026.10.07.1900" applyUpdate={vi.fn()} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saving your changes first — 3 changes still to upload.");
  });

  it("does not loop when the reload came back to the old version: it says to reopen, with Reload", async () => {
    markTried("2026.10.07.1900", sessionStorage);
    const applyUpdate = vi.fn();
    render(<UpdateRequired min="2026.10.07.1900" applyUpdate={applyUpdate} />);
    expect(screen.getByRole("status")).toHaveTextContent("It opened the old version again. Close Sparehour completely, then open it again.");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    await act(async () => {});
    expect(applyUpdate).not.toHaveBeenCalled();
    // Reload goes through the update path (a waiting worker takes over), not a plain reload of this version.
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Updating…");
    expect(screen.getByRole("heading", { name: "Update required" })).toHaveFocus();
  });
});
