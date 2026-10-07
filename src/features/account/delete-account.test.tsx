// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const db = { execute: vi.fn(async () => ({})), disconnectAndClear: vi.fn(async () => {}) };
vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => db }));
const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/data/supabase-browser", () => ({ supabaseBrowser: () => ({ auth: { signOut } }) }));

const { default: DeleteAccountSheet } = await import("./delete-account-sheet");
const { DELETED_THINGS, requestAccountDeletion } = await import("./deletion");
const { clearThisDevice } = await import("./clear-device");

afterEach(() => {
  vi.clearAllMocks();
});

const AFTER = "2026-11-06T03:50:00.000Z";

describe("Delete account's sheet (SCREENS.md §18 Account)", () => {
  it("says exactly what goes, offers the export first, and waits for the typed word", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const request = vi.fn(async () => AFTER);
    const onDeleted = vi.fn(async () => {});
    render(<DeleteAccountSheet onClose={vi.fn()} exporter={{ onExport, busy: false, error: null, lastFile: null }} request={request} onDeleted={onDeleted} />);
    const dialog = screen.getByRole("dialog", { name: "Delete your account?" });
    expect(within(dialog).getByText(DELETED_THINGS)).toBeInTheDocument();
    expect(within(dialog).getByText(/30 days to change your mind/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Export your data first" }));
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();

    const go = within(dialog).getByRole("button", { name: "Delete account" });
    expect(go).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/to confirm/), "delet");
    expect(go).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/to confirm/), "e");
    expect(go).toBeEnabled();
    await user.click(go);
    expect(request).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith(AFTER);
    expect(within(dialog).getByRole("button", { name: "Deleting…" })).toBeDisabled();
  });

  it("shows the export's progress and the file it saved", () => {
    const { rerender } = render(<DeleteAccountSheet onClose={vi.fn()} exporter={{ onExport: vi.fn(), busy: true, error: null, lastFile: null }} request={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Preparing…" })).toBeDisabled();
    rerender(<DeleteAccountSheet onClose={vi.fn()} exporter={{ onExport: vi.fn(), busy: false, error: null, lastFile: "sparehour-export-2026-10-07.json" }} request={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved sparehour-export-2026-10-07.json");
  });

  it("a refusal keeps the account, says why in the deadline role, and the sheet stays to try again", async () => {
    const user = userEvent.setup();
    const request = vi.fn().mockRejectedValueOnce(new Error("Couldn’t reach your account — deleting it needs a connection. Nothing changed.")).mockResolvedValueOnce(AFTER);
    const onDeleted = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<DeleteAccountSheet onClose={onClose} request={request} onDeleted={onDeleted} />);
    await user.type(screen.getByLabelText(/to confirm/), "Delete ");
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t reach your account — deleting it needs a connection. Nothing changed.");
    expect(alert).toHaveClass("text-deadline");
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(onDeleted).toHaveBeenCalledWith(AFTER);
  });

  it("Cancel closes without asking the server", async () => {
    const user = userEvent.setup();
    const request = vi.fn();
    const onClose = vi.fn();
    render(<DeleteAccountSheet onClose={onClose} request={request} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("once deleted, clears this device, signs it out and goes to the page that names the day", async () => {
    const user = userEvent.setup();
    const replace = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, replace } });
    try {
      render(<DeleteAccountSheet onClose={vi.fn()} request={async () => AFTER} />);
      await user.type(screen.getByLabelText(/to confirm/), "delete");
      await user.click(screen.getByRole("button", { name: "Delete account" }));
      await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/account/deleted?on=${encodeURIComponent(AFTER)}`));
      expect(db.disconnectAndClear).toHaveBeenCalled();
      expect(db.execute).toHaveBeenCalledWith("VACUUM");
      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });
});

describe("requestAccountDeletion", () => {
  it("posts the confirming word as JSON and resolves the day the account goes", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ delete_after: AFTER }), { status: 200 }));
    expect(await requestAccountDeletion(fetchImpl as unknown as typeof fetch)).toBe(AFTER);
    expect(fetchImpl).toHaveBeenCalledWith("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "delete" }) });
  });

  it("says nothing changed when it cannot reach the server or the server refuses", async () => {
    await expect(requestAccountDeletion((async () => Promise.reject(new TypeError("offline"))) as unknown as typeof fetch)).rejects.toThrow("needs a connection. Nothing changed.");
    await expect(requestAccountDeletion((async () => new Response("{}", { status: 500 })) as unknown as typeof fetch)).rejects.toThrow("Nothing changed — try again.");
  });
});

describe("clearThisDevice", () => {
  it("zeroes deleted pages, clears the database and compacts it, even when the pragmas fail", async () => {
    const order: string[] = [];
    const fake = {
      execute: vi.fn(async (sql: string) => {
        order.push(sql);
        if (sql === "VACUUM") throw new Error("busy");
        return {};
      }),
      disconnectAndClear: vi.fn(async () => void order.push("clear")),
    };
    await clearThisDevice(fake as unknown as Parameters<typeof clearThisDevice>[0]);
    expect(order).toEqual(["PRAGMA secure_delete = ON", "clear", "VACUUM"]);
  });
});
