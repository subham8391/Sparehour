// @vitest-environment jsdom
// Storage that will not open (SYSTEM_DESIGN.md §10.3; ruled 2026-10-06: no in-memory fallback at M1): the provider
// hands the failure to `failed` instead of leaving the app waiting on a database that never comes.
import { render, screen } from "@testing-library/react";
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

const { PowerSyncProvider, watchStorage } = await import("./provider");

afterEach(() => {
  vi.unstubAllGlobals();
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
