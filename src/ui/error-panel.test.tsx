// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppError from "@/app/(app)/error";
import { BoundaryPanel, boundaryWords, errorDetails } from "./error-panel";
import { PaneBoundary } from "./pane-boundary";

afterEach(() => {
  vi.restoreAllMocks();
});

const at = new Date("2026-10-07T16:00:00Z");

describe("errorDetails (SCREENS.md §21 Copy details)", () => {
  it("names the error, its digest, the build, the browser and the time — never the stack", () => {
    const error = Object.assign(new TypeError("Cannot read properties of undefined (reading 'start')"), { digest: "3141592653" });
    const text = errorDetails({ what: "A Sparehour screen stopped drawing.", error, build: "2026.10.07.1500", userAgent: "UA/1", at });
    expect(text).toBe(
      "A Sparehour screen stopped drawing.\nError: TypeError: Cannot read properties of undefined (reading 'start')\nDigest: 3141592653\nVersion: 2026.10.07.1500\nBrowser: UA/1\nWhen: 2026-10-07T16:00:00.000Z",
    );
    expect(text).not.toMatch(/\n\s+at /);
  });

  it("copes with a thrown string and with no digest", () => {
    expect(errorDetails({ what: "x", error: "odd", build: "b", userAgent: "u", at })).toBe("x\nError: odd\nVersion: b\nBrowser: u\nWhen: 2026-10-07T16:00:00.000Z");
  });
});

let broken = true;
function Flaky() {
  if (broken) throw new Error("the timeline lost its day");
  return <p>Drawn again</p>;
}

describe("PaneBoundary: a pane that throws fails in place", () => {
  it("shows the inline panel with Try again and Copy details instead of a blank pane, and Try again draws it again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();
    broken = true;
    render(
      <div>
        <p>The list still works</p>
        <PaneBoundary name="Your day" build="b1">
          <Flaky />
        </PaneBoundary>
      </div>,
    );
    expect(screen.getByText("The list still works")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Your day stopped before it finished drawing." })).toBeInTheDocument();
    for (const name of ["Try again", "Copy details"]) expect(screen.getByRole("button", { name })).toHaveClass("h-11");
    expect(document.body.textContent).not.toMatch(/Something went wrong|at \w+ \(/);

    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole("button", { name: "Copy details" }));
    expect(writeText.mock.calls[0][0]).toMatch(/^“Your day” stopped drawing\.\nError: Error: the timeline lost its day\nVersion: b1\n/);
    expect(screen.getByRole("status")).toHaveTextContent("Copied.");

    broken = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Drawn again")).toBeInTheDocument();
  });

  it("draws the pane afresh when what it shows changes (Today stepped to another day), without Try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    broken = true;
    const pane = (day: string) => (
      <PaneBoundary name="Your day" build="b1" resetKey={day}>
        <Flaky />
      </PaneBoundary>
    );
    const { rerender } = render(pane("2026-10-07"));
    expect(await screen.findByRole("heading", { name: "Your day stopped before it finished drawing." })).toBeInTheDocument();
    broken = false;
    rerender(pane("2026-10-07"));
    expect(screen.queryByText("Drawn again")).toBeNull();
    rerender(pane("2026-10-08"));
    expect(await screen.findByText("Drawn again")).toBeInTheDocument();
  });
});

describe("the root boundary (app/global-error.tsx)", () => {
  it("stands alone in the window with its own words, Try again and Copy details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reset = vi.fn();
    render(<BoundaryPanel kind="start" error={new Error("root")} build="b2" onRetry={reset} />);
    expect(screen.getByRole("heading", { level: 1, name: "Sparehour stopped before it finished starting." })).toBeInTheDocument();
    expect(screen.getByText(/^Nothing you saved is lost: it is on this device and in your account\./)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
    expect(boundaryWords({ kind: "start" }).what).toBe("Sparehour stopped while starting.");
  });
});

describe("the app's route boundary (app/(app)/error.tsx)", () => {
  it("says what happened in plain words; Try again resets the segment", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reset = vi.fn();
    render(<AppError error={Object.assign(new Error("boom"), { digest: "d1" })} reset={reset} />);
    expect(await screen.findByRole("heading", { name: "This screen stopped before it finished drawing." })).toBeInTheDocument();
    expect(screen.getByText(/Nothing you saved is lost/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
  });
});
