// @vitest-environment jsdom
// The share target's page: what another app shared opens quick add holding it, over the Inbox; with nothing shared it
// says so and offers the way to Today.
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ open: vi.fn(), replace: vi.fn(), search: "" }));
const router = { replace: h.replace };
const quickAdd = { open: h.open };
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(h.search) }));
vi.mock("@/features/quickadd/quick-add-provider", () => ({ useQuickAdd: () => quickAdd }));
vi.mock("@/features/commands/palette-provider", () => ({ usePalette: () => ({ open: vi.fn() }) }));

const { default: SharePage } = await import("./page");

beforeEach(() => {
  h.open.mockClear();
  h.replace.mockClear();
});

describe("/share", () => {
  it("opens quick add on the shared words, the link as the note, once, and goes to the Inbox", () => {
    h.search = "title=Read+the+report&url=https%3A%2F%2Fexample.com%2Freport";
    // Strict mode runs the effect twice in development: the words must not be handed over twice.
    const { container } = render(
      <StrictMode>
        <SharePage />
      </StrictMode>,
    );
    expect(h.open).toHaveBeenCalledTimes(1);
    expect(h.open).toHaveBeenCalledWith("Read the report // https://example.com/report");
    expect(h.replace).toHaveBeenCalledWith("/inbox");
    expect(container).toBeEmptyDOMElement();
  });

  it("with nothing shared it says so, with the way to Today, and opens nothing", () => {
    h.search = "";
    render(<SharePage />);
    expect(screen.getByRole("heading", { name: "Nothing came through" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute("href", "/today");
    expect(h.open).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
  });
});
