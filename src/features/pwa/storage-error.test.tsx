// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import StorageError, { storageErrorDetails } from "./storage-error";

afterEach(() => {
  vi.restoreAllMocks();
});

const failure = new DOMException("Security error when calling GetDirectory", "SecurityError");

describe("the storage error state (SCREENS.md §21 Unexpected failure)", () => {
  it("says what happened in plain words with Try again and Copy details, 44 px on the phone", () => {
    render(<StorageError error={failure} />);
    expect(screen.getByRole("heading", { name: "Sparehour can’t open its storage in this window." })).toBeInTheDocument();
    expect(screen.getByText(/Private windows often keep it shut/)).toBeInTheDocument();
    for (const name of ["Try again", "Copy details"]) expect(screen.getByRole("button", { name })).toHaveClass("h-11");
    expect(document.body.textContent).not.toMatch(/Something went wrong|at \w+ \(/);
  });

  it("Try again reloads", async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
    try {
      render(<StorageError error={failure} />);
      await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
      expect(reload).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });

  it("Copy details copies the error, the version and the browser, and shows them when the clipboard refuses", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValueOnce(undefined);
    render(<StorageError error={failure} />);
    await user.click(screen.getByRole("button", { name: "Copy details" }));
    expect(writeText.mock.calls[0][0]).toMatch(/^Sparehour couldn’t open this device’s storage\.\nError: SecurityError: Security error when calling GetDirectory\nVersion: /);
    expect(screen.getByRole("status")).toHaveTextContent("Copied.");

    writeText.mockRejectedValueOnce(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy details" }));
    expect(screen.getByRole("status")).toHaveTextContent("Couldn’t copy — here they are:");
    expect(screen.getByText(/Error: SecurityError/)).toBeInTheDocument();
  });

  it("the details name nothing personal", () => {
    expect(storageErrorDetails("odd", "2026.10.07.1500", "UA/1", new Date("2026-10-07T16:00:00Z"))).toBe(
      "Sparehour couldn’t open this device’s storage.\nError: odd\nVersion: 2026.10.07.1500\nBrowser: UA/1\nWhen: 2026-10-07T16:00:00.000Z",
    );
  });
});
