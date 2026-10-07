// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PwaApi } from "@/features/pwa/pwa-provider";

const h = vi.hoisted(() => ({
  calendar: [{ at: "2026-09-14T08:58:00Z", n: 1 }] as { at: string | null; n: number }[],
  syncNow: vi.fn(() => Promise.resolve()),
  calendarSyncNow: vi.fn(() => Promise.resolve({ ok: true, message: "Synced." })),
  pwa: null as PwaApi | null,
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/browse" }));
vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: h.calendar }) }));
vi.mock("@/data/powersync/provider", () => ({ syncNow: h.syncNow }));
vi.mock("@/features/calendar/sync-now", () => ({ calendarSyncNow: h.calendarSyncNow }));
vi.mock("@/features/pwa/pwa-provider", () => ({ usePwaOptional: () => h.pwa }));

const { default: SyncExtras, clockTime } = await import("./sync-panel");
const { syncChipModel, SyncModelContext } = await import("./sync-chip");
const { SyncRow } = await import("./sync-row");

const now = new Date("2026-09-14T09:00:00Z");
const base = { online: true, connected: true, uploading: false, downloading: false, hasError: false, lastSyncedAt: new Date("2026-09-14T08:59:48Z"), pending: 0, now };
const pwa = (over: Partial<PwaApi>): PwaApi => ({
  install: { kind: "browser-menu" },
  persistence: "unprotected",
  requestPersist: vi.fn(),
  promptInstall: vi.fn(() => Promise.resolve()),
  updateReady: false,
  reloadToUpdate: vi.fn(),
  ...over,
});

beforeEach(() => {
  h.calendar = [{ at: "2026-09-14T08:58:00Z", n: 1 }];
  h.syncNow.mockClear();
  h.calendarSyncNow.mockClear();
  h.pwa = null;
});

describe("the expanded Synced state (SCREENS.md §20)", () => {
  it("shows the exact last sync, when the calendar was last read, and Sync now runs the data and the calendar", async () => {
    const model = syncChipModel(base);
    expect(model.lastSyncedAt).toEqual(base.lastSyncedAt);
    render(<SyncExtras model={model} />);
    expect(screen.getByText(`Last synced ${clockTime(base.lastSyncedAt)}`)).toBeInTheDocument();
    expect(screen.getByText(`Calendar read ${clockTime(new Date("2026-09-14T08:58:00Z"))}`)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Sync now" });
    expect(button).toHaveClass("h-11");
    await userEvent.setup().click(button);
    expect(h.syncNow).toHaveBeenCalledTimes(1);
    expect(h.calendarSyncNow).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Synced.");
  });

  it("without a calendar, Sync now is the data alone and no calendar line shows", async () => {
    h.calendar = [{ at: null, n: 0 }];
    render(<SyncExtras model={syncChipModel(base)} />);
    expect(screen.queryByText(/Calendar/)).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Sync now" }));
    expect(h.syncNow).toHaveBeenCalledTimes(1);
    expect(h.calendarSyncNow).not.toHaveBeenCalled();
  });

  it("names a day that was not today", () => {
    expect(clockTime(new Date("2026-09-12T10:00:00"), new Date("2026-09-14T09:00:00"))).toMatch(/^\w{3} /);
  });
});

describe("Storage not protected: install steps per platform (SCREENS.md §20)", () => {
  const unprotected = syncChipModel({ ...base, persisted: false });

  it("iPhone gets the three steps and the Apple rule", () => {
    h.pwa = pwa({ install: { kind: "coach-ios", steps: ["Tap Share, or ··· then Share, at the bottom of Safari.", "Scroll down and tap Add to Home Screen.", "Tap Add."] } });
    render(<SyncExtras model={unprotected} />);
    expect(screen.getByRole("region", { name: "Add Sparehour to your Home Screen" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("Safari on a Mac gets Add to Dock", () => {
    h.pwa = pwa({ install: { kind: "coach-safari", steps: ["Choose File → Add to Dock", "Open Sparehour from the Dock"] } });
    render(<SyncExtras model={unprotected} />);
    expect(screen.getByRole("region", { name: "Add Sparehour to your Dock" })).toHaveTextContent("Choose File → Add to Dock");
  });

  it("Chromium gets an Install button that opens the browser's prompt", async () => {
    const promptInstall = vi.fn(() => Promise.resolve());
    h.pwa = pwa({ install: { kind: "prompt" }, promptInstall });
    render(<SyncExtras model={unprotected} />);
    const button = screen.getByRole("button", { name: "Install Sparehour" });
    expect(button).toHaveClass("w-full", "h-11");
    await userEvent.setup().click(button);
    expect(promptInstall).toHaveBeenCalled();
  });

  it("once installed, the persistence line says what is left to happen", () => {
    h.pwa = pwa({ install: { kind: "installed" } });
    render(<SyncExtras model={unprotected} />);
    expect(screen.getByText(/Not protected yet/)).toBeInTheDocument();
  });
});

describe("storage full is a sync problem with its own reason and fix", () => {
  it("says so plainly and offers the export", () => {
    const model = syncChipModel({ ...base, storageFull: true, pending: 2 });
    expect(model).toMatchObject({ state: "problem", label: "Sync problem", action: "export" });
    expect(model.detail).toMatch(/out of room/);
    expect(model.detail).toMatch(/Nothing already saved is lost/);
  });
});

describe("Browse's sync row on a phone (ruling R4)", () => {
  it("shows the chip's words and opens the expanded state as a sheet", async () => {
    const model = syncChipModel({ ...base, online: false, pending: 2, waiting: ["Changed a task"] });
    render(
      <SyncModelContext.Provider value={model}>
        <SyncRow />
      </SyncModelContext.Provider>,
    );
    const row = screen.getByRole("button", { name: /Offline · 2 changes waiting/ });
    expect(row).toHaveClass("min-h-11");
    await userEvent.setup().click(row);
    const sheet = await screen.findByRole("dialog", { name: "Sync status" });
    expect(sheet).toHaveTextContent(/saved on this device/);
    expect(sheet).toHaveTextContent("Changed a task");
  });
});
