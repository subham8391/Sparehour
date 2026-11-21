// @vitest-environment jsdom
// Storage that will not open (SYSTEM_DESIGN.md §10.3; ruled 2026-10-06: no in-memory fallback at M1): the provider
// hands the failure to `failed` instead of leaving the app waiting on a database that never comes.
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const ready = vi.hoisted(() => ({ result: Promise.resolve() as Promise<void> }));
vi.mock("@powersync/web", () => ({
  PowerSyncDatabase: class {
    waitForReady = () => ready.result;
    connect = () => Promise.resolve();
  },
  WASQLiteVFS: { OPFSCoopSyncVFS: "opfs" },
  LogLevels: { info: 1, warn: 2 },
  createConsoleLogger: () => ({}),
}));
vi.mock("./connector", () => ({ SparehourConnector: class {} }));
vi.mock("../schema.client", () => ({ AppSchema: {} }));

const { OwnerGate, PowerSyncProvider, watchStorage } = await import("./provider");
const { markSignInStarted, readDeviceOwner, setDeviceOwner, signInPending } = await import("./owner");

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => setDeviceOwner("unknown"));
  localStorage.clear();
});

describe("watchStorage", () => {
  it("reports a database that fails to open, or an origin file system that is refused", async () => {
    const onFailure = vi.fn();
    const failure = new DOMException("Security error when calling GetDirectory", "SecurityError");
    watchStorage({ waitForReady: () => Promise.reject(failure) }, undefined, onFailure);
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalledWith(failure));

    const refused = vi.fn();
    watchStorage({ waitForReady: () => new Promise(() => {}) }, { getDirectory: () => Promise.reject(failure) }, refused);
    await vi.waitFor(() => expect(refused).toHaveBeenCalledWith(failure));
  });

  it("stays quiet while all is well", async () => {
    const onFailure = vi.fn();
    watchStorage({ waitForReady: () => Promise.resolve() }, { getDirectory: () => Promise.resolve({}) }, onFailure);
    await new Promise((r) => setTimeout(r, 5));
    expect(onFailure).not.toHaveBeenCalled();
  });
});

describe("<PowerSyncProvider>", () => {
  it("shows the failure state instead of the app when storage will not open", async () => {
    ready.result = Promise.reject(new Error("no OPFS here"));
    ready.result.catch(() => {});
    render(
      <PowerSyncProvider failed={(e) => <p role="alert">{(e as Error).message}</p>}>
        <p>Today</p>
      </PowerSyncProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("no OPFS here");
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });
});

// Whose copy the device holds (DECISIONS.md, amendment 2026-11-21): nothing of another account's copy is drawn.
describe("<OwnerGate>", () => {
  const fakeDb = () => {
    const order: string[] = [];
    return {
      order,
      execute: vi.fn(async (sql: string) => void order.push(sql)),
      disconnectAndClear: vi.fn(async () => void order.push("clear")),
    };
  };
  const OPENING = "Opening your data…";

  it("draws the device's copy at once when no sign-in was just made: an ordinary start waits for nothing", () => {
    render(
      <OwnerGate db={fakeDb() as never}>
        <p>Today</p>
      </OwnerGate>,
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("straight after the sign-in page, holds the copy back until the token says it is the account's own", () => {
    markSignInStarted();
    render(
      <OwnerGate db={fakeDb() as never}>
        <p>Today</p>
      </OwnerGate>,
    );
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.getByText(OPENING)).toBeInTheDocument();
    act(() => setDeviceOwner("ok"));
    expect(screen.getByText("Today")).toBeInTheDocument();
    // The mark is spent: the next start is an ordinary one.
    expect(signInPending()).toBe(false);
  });

  it("with no answer (offline, the token route down), shows the copy after the wait", async () => {
    markSignInStarted();
    render(
      <OwnerGate db={fakeDb() as never} wait={20}>
        <p>Today</p>
      </OwnerGate>,
    );
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(await screen.findByText("Today")).toBeInTheDocument();
    // Nothing was settled, so the next start asks again.
    expect(signInPending()).toBe(true);
  });

  it("clears another account's copy, leaving nothing readable, and lets the sync start over", async () => {
    const db = fakeDb();
    render(
      <OwnerGate db={db as never}>
        <p>Today</p>
      </OwnerGate>,
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
    act(() => setDeviceOwner("foreign"));
    // Not one more frame of it.
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    expect(screen.getByText(OPENING)).toBeInTheDocument();
    await vi.waitFor(() => expect(readDeviceOwner()).toBe("unknown"));
    expect(db.order).toEqual(["PRAGMA secure_delete = ON", "clear", "VACUUM"]);
    expect(db.disconnectAndClear).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Today")).toBeInTheDocument();
  });

  it("a copy found foreign straight after a sign-in stays hidden until the new account's own answer", async () => {
    markSignInStarted();
    const db = fakeDb();
    render(
      <OwnerGate db={db as never}>
        <p>Today</p>
      </OwnerGate>,
    );
    act(() => setDeviceOwner("foreign"));
    await vi.waitFor(() => expect(db.disconnectAndClear).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(readDeviceOwner()).toBe("unknown"));
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
    act(() => setDeviceOwner("ok"));
    expect(screen.getByText("Today")).toBeInTheDocument();
  });
});
