// @vitest-environment jsdom
// SYSTEM_DESIGN.md §10.4: persistence is asked again once the app is installed, and the status follows the answer.
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@serwist/window", () => ({ Serwist: class {} }));
vi.mock("@/features/shell/preload-on-idle", () => ({ useIdleMount: () => false }));
const { PwaProvider, usePwa } = await import("./pwa-provider");

function Status() {
  return <p>{usePwa().persistence}</p>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("PwaProvider persistence", () => {
  it("asks again after appinstalled even though it asked before, and the status line refreshes", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
    let granted = false;
    // The browser grants it once the app is installed; before that it says no.
    let installed = false;
    const persist = vi.fn(async () => (granted = installed));
    const persisted = vi.fn(async () => granted);
    Object.defineProperty(navigator, "storage", { configurable: true, value: { persist, persisted } });
    localStorage.setItem("sparehour.persist-asked", "1");
    render(
      <PwaProvider>
        <Status />
      </PwaProvider>,
    );
    expect(await screen.findByText("unprotected")).toBeInTheDocument();
    installed = true;
    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(await screen.findByText("protected")).toBeInTheDocument();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
