// @vitest-environment jsdom
// Browse's tap path for organising (DECISIONS.md "a tap alternative for every drag"): every area and project row
// has a ⋯ that is always shown and 44 px on the phone, and it opens the organise sheet; the rows carry the
// attributes the drag wiring looks for.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("@/features/tasks/use-repos", () => ({ useAreaRepo: () => ({}), useProjectRepo: () => ({}), useProjectOrderRepo: () => ({ move: vi.fn() }) }));
vi.mock("@/features/shell/nav-drag-island", () => ({ useNavDragActions: () => ({ actions: {}, treeRef: { current: [] } }) }));
vi.mock("@/features/shell/use-nav-data", () => ({
  useNavData: () => ({
    counts: { inbox: 0, today: 0 },
    areas: [
      { id: "work", name: "Work", projects: [{ id: "q4", name: "Q4 launch" }] },
      { id: "__loose", name: "Projects", loose: true, projects: [{ id: "side", name: "Side thing" }] },
    ],
  }),
}));
vi.mock("@/features/commands/palette-provider", () => ({ usePalette: () => ({ open: () => {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import BrowsePage from "./page";

describe("Browse: organising areas and projects by tap", () => {
  it("gives every area and project a ⋯ that is always there and 44 px on the phone", () => {
    render(<BrowsePage />);
    for (const name of ["Work", "Q4 launch", "Side thing"]) {
      const more = screen.getByRole("button", { name: `Organise ${name}` });
      expect(more.className).toContain("size-11");
      expect(more.className).not.toMatch(/(^|\s)(hidden|opacity-0)/);
    }
    // The no-area heading is a drop target only: nothing to organise on it.
    expect(screen.queryByRole("button", { name: "Organise Projects" })).toBeNull();
  });

  it("marks the rows the drag wiring takes up", () => {
    const { container } = render(<BrowsePage />);
    expect([...container.querySelectorAll("[data-nav-area]")].map((e) => e.getAttribute("data-nav-area"))).toEqual(["work", "__loose"]);
    expect([...container.querySelectorAll("[data-nav-project]")].map((e) => e.getAttribute("data-nav-project"))).toEqual(["q4", "side"]);
  });

  it("the ⋯ opens the organise sheet for that row", async () => {
    const user = userEvent.setup();
    render(<BrowsePage />);
    await user.click(screen.getByRole("button", { name: "Organise Q4 launch" }));
    expect(await screen.findByRole("menuitem", { name: "Move to area…" })).toBeInTheDocument();
  });
});
