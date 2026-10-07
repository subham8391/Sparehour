// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StorageFull from "./storage-full";

describe("the storage-full banner (SCREENS.md §21 Quota / storage full)", () => {
  it("offers Export your data first, full width on a phone, then says what to do", () => {
    render(<StorageFull />);
    const banner = screen.getByRole("alert", { name: "Storage full" });
    const exportLink = screen.getByRole("link", { name: "Export your data" });
    expect(exportLink).toHaveAttribute("href", "/settings#data");
    expect(exportLink).toHaveClass("w-full", "h-11");
    const text = banner.textContent ?? "";
    expect(text.indexOf("Export your data")).toBeLessThan(text.indexOf("free some room"));
    expect(text).toMatch(/still here and in your account/);
  });
});
