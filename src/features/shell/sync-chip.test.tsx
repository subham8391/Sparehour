// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SyncChip, relativeTime, syncChipModel, type SyncChipInput } from "./sync-chip";

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
