// @vitest-environment jsdom
// The forced update's trigger in the PWA provider (SYSTEM_DESIGN.md §10.2): /api/bootstrap is asked at start, and a
// min_client_version above this build closes the gate with "Update required"; at or below it, or for a development
// build, nothing shows.
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

describe("PwaProvider's version gate", () => {
  it("blocks with Update required when the oldest build allowed is newer than this one", async () => {
    gate = "2026.10.07.1900";
    render(
      <PwaProvider>
        <p>Today</p>
      </PwaProvider>,
    );
    expect(await screen.findByRole("alertdialog", { name: "Update required" })).toHaveTextContent("2026.10.07.1900");
    expect(fetchMock).toHaveBeenCalledWith("/api/bootstrap", expect.objectContaining({ cache: "no-store" }));
  });

  it("stays open at or above the gate", async () => {
    gate = "2026.10.07.1500";
    render(
      <PwaProvider>
        <p>Today</p>
      </PwaProvider>,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("a development build never asks", async () => {
    build.id = "dev";
    gate = "9999";
    render(
      <PwaProvider>
        <p>Today</p>
      </PwaProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
