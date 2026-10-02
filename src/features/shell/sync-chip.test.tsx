// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/inbox" }));
import { SyncChip, relativeTime, syncChipModel, type SyncChipInput } from "./sync-chip";
import { describeChange, errorKind } from "./use-sync-chip";

const now = new Date("2026-09-14T09:00:00Z");
const base: SyncChipInput = {
  online: true,
  connected: true,
  uploading: false,
  downloading: false,
  hasError: false,
  lastSyncedAt: new Date("2026-09-14T08:59:48Z"),
  pending: 0,
  now,
};

describe("syncChipModel", () => {
  it("says when it last synced", () => {
    expect(syncChipModel(base)).toMatchObject({ state: "synced", label: "Synced 12s ago" });
  });

  it("before anything has synced, an opening socket is connecting, not offline", () => {
    expect(syncChipModel({ ...base, connected: false, lastSyncedAt: null })).toMatchObject({ state: "connecting", label: "Connecting…" });
    expect(syncChipModel({ ...base, connected: false, lastSyncedAt: null, hasError: true }).state).toBe("connecting");
    // Once it has synced, losing the socket is the offline state; a browser offline is offline from the start.
    expect(syncChipModel({ ...base, connected: false }).state).toBe("offline");
    expect(syncChipModel({ ...base, connected: false, lastSyncedAt: null, online: false }).state).toBe("offline");
  });

  it("the browser being offline wins, and counts the changes waiting", () => {
    expect(syncChipModel({ ...base, online: false, pending: 3 })).toMatchObject({ state: "offline", label: "Offline · 3 changes waiting" });
    expect(syncChipModel({ ...base, online: false, pending: 1 }).label).toBe("Offline · 1 change waiting");
    expect(syncChipModel({ ...base, online: false }).label).toBe("Offline");
  });

  it("an unreachable sync server is the offline state, not an error", () => {
    expect(syncChipModel({ ...base, connected: false, hasError: true }).state).toBe("offline");
  });

  it("shows syncing while data is moving", () => {
    expect(syncChipModel({ ...base, uploading: true, pending: 2 })).toMatchObject({ state: "syncing", label: "Syncing…", detail: "2 changes in flight" });
    expect(syncChipModel({ ...base, downloading: true }).state).toBe("syncing");
  });

  it("reports a problem in plain words with the reassurance", () => {
    const m = syncChipModel({ ...base, hasError: true, pending: 2 });
    expect(m.state).toBe("problem");
    expect(m.detail).toMatch(/Nothing is lost/);
    expect(m.detail).toMatch(/2 changes are waiting/);
  });

  it("warns when the browser has not protected the data, but only when nothing else is wrong", () => {
    expect(syncChipModel({ ...base, persisted: false })).toMatchObject({ state: "unprotected", label: "Storage not protected" });
    expect(syncChipModel({ ...base, persisted: false }).detail).toMatch(/Install Sparehour/);
    expect(syncChipModel({ ...base, persisted: false, online: false }).state).toBe("offline");
    expect(syncChipModel({ ...base, persisted: false, uploading: true }).state).toBe("syncing");
    expect(syncChipModel({ ...base, persisted: true }).state).toBe("synced");
    expect(syncChipModel({ ...base }).state).toBe("synced");
  });

  it("never blames the user or uses a technical word", () => {
    for (const m of [syncChipModel(base), syncChipModel({ ...base, online: false }), syncChipModel({ ...base, hasError: true })]) {
      expect(`${m.label} ${m.detail}`).not.toMatch(/error|fail|exception|socket|http/i);
    }
  });
});

describe("relativeTime", () => {
  it("rounds to the unit a person would say", () => {
    const at = (iso: string) => relativeTime(new Date(iso), now);
    expect(at("2026-09-14T08:59:58Z")).toBe("just now");
    expect(at("2026-09-14T08:59:20Z")).toBe("40s ago");
    expect(at("2026-09-14T08:45:00Z")).toBe("15m ago");
    expect(at("2026-09-14T06:00:00Z")).toBe("3h ago");
    expect(at("2026-09-11T09:00:00Z")).toBe("3d ago");
  });
});

describe("<SyncChip>", () => {
  it("expands to the detail on click and exposes its state", async () => {
    const user = userEvent.setup();
    render(<SyncChip model={syncChipModel({ ...base, online: false, pending: 1 })} />);
    const chip = screen.getByRole("button", { name: /Offline · 1 change waiting/ });
    expect(chip).toHaveAttribute("data-state", "offline");
    expect(chip).toHaveAttribute("aria-expanded", "false");
    await user.click(chip);
    expect(screen.getByRole("region", { name: "Sync status" })).toHaveTextContent(/saved on this device/);
  });

  it("compact keeps the label for assistive tech", () => {
    render(<SyncChip model={syncChipModel(base)} compact />);
    expect(screen.getByRole("button", { name: "Synced 12s ago" })).toBeInTheDocument();
  });
});

describe("sync chip: a session the server turned away, and failures by kind (found by the walkthrough)", () => {
  it("a revoked or expired session says Signed out, counts what waits, and offers to sign in again", async () => {
    const model = syncChipModel({ ...base, hasError: true, signedOut: true, pending: 1 });
    expect(model).toMatchObject({ state: "signed_out", label: "Signed out · 1 change waiting", action: "sign_in" });
    expect(model.detail).toMatch(/Sign in again to send it; it stays on this device/);
    const user = userEvent.setup();
    render(<SyncChip model={model} />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login?next=%2Finbox");
  });

  it("a server that cannot be reached is the offline state, verbatim; a 5xx says the server could not save", () => {
    expect(syncChipModel({ ...base, hasError: true, unreachable: true, pending: 2 })).toMatchObject({ state: "offline", label: "Offline · 2 changes waiting" });
    expect(syncChipModel({ ...base, hasError: true, serverError: true }).detail).toMatch(/^The server couldn't save the last sync/);
    expect(syncChipModel({ ...base, hasError: true }).detail).toMatch(/^The server didn't accept the last sync/);
  });

  it("errorKind tells the network from the server", () => {
    expect(errorKind(new TypeError("Failed to fetch"))).toBe("network");
    expect(errorKind(new Error("retryable upload failure: 503"))).toBe("server");
    expect(errorKind(new Error("auth"))).toBe("other");
    expect(errorKind(undefined)).toBeNull();
  });
});

describe("the offline chip lists what is waiting (SCREENS.md §20)", () => {
  it("names the first changes in words and counts the rest", async () => {
    const model = syncChipModel({ ...base, online: false, pending: 7, waiting: ["Added “Order new desk lamp”", "Changed a task"] });
    expect(model).toMatchObject({ state: "offline", waiting: ["Added “Order new desk lamp”", "Changed a task"], more: 5 });
    render(<SyncChip model={model} />);
    await userEvent.setup().click(screen.getByRole("button"));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("Added “Order new desk lamp”")).toBeInTheDocument();
    expect(screen.getByText("+5 more")).toBeInTheDocument();
  });

  it("describes a queued PowerSync change", () => {
    expect(describeChange(JSON.stringify({ op: "PUT", type: "tasks", id: "1", data: { title: "Order new desk lamp" } }))).toBe("Added “Order new desk lamp”");
    expect(describeChange(JSON.stringify({ op: "PATCH", type: "tasks", id: "1", data: { state: "done" } }))).toBe("Changed a task");
    expect(describeChange(JSON.stringify({ op: "PATCH", type: "time_blocks", id: "1", data: { deleted_at: "2026-10-01T10:00:00Z" } }))).toBe("Removed a block");
    expect(describeChange("not json")).toBe("A change");
  });
});
