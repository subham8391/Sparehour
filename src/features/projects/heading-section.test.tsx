// @vitest-environment jsdom
// A project heading (SCREENS.md §9): Move up / Move down in its ⋯ (the tap
// path for the drag), a disclosure that folds its tasks away with their count
// beside the title, and delete with the tasks kept.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Heading, ProjectId } from "@/core/types";
import { HeadingSection } from "./heading-section";

const heading: Heading = { id: "h1", projectId: "p1" as ProjectId, title: "Budget", sortKey: "a1" };

function Harness({ first = false, last = false, onMove = vi.fn(), onRemove = vi.fn() }: { first?: boolean; last?: boolean; onMove?: (dir: -1 | 1) => void; onRemove?: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <HeadingSection
      heading={heading}
      collapsed={collapsed}
      onToggle={() => setCollapsed((c) => !c)}
      openCount={3}
      first={first}
      last={last}
      onMove={onMove}
      onDropHeading={vi.fn()}
      onRename={vi.fn()}
      onRemove={onRemove}
    >
      <p>Collect quotes</p>
      <input aria-label="Add to Budget" />
    </HeadingSection>
  );
}

describe("<HeadingSection>", () => {
  it("moves up or down from its menu, offering only the moves it can make", async () => {
    const onMove = vi.fn();
    const user = userEvent.setup();
    render(<Harness first onMove={onMove} />);
    await user.click(screen.getByRole("button", { name: "Heading actions: Budget" }));
    expect(screen.queryByRole("menuitem", { name: "Move up" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(onMove).toHaveBeenCalledWith(1);
  });

  it("a lone heading has no move menu", () => {
    render(<Harness first last />);
    expect(screen.queryByRole("button", { name: "Heading actions: Budget" })).toBeNull();
  });

  it("folds its tasks and its add row away, with the count beside the title", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText("Collect quotes")).toBeInTheDocument();
    const fold = screen.getByRole("button", { name: "Fold away the tasks under Budget" });
    expect(fold).toHaveAttribute("aria-expanded", "true");
    await user.click(fold);
    expect(screen.queryByText("Collect quotes")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Add to Budget" })).toBeNull();
    expect(screen.getByText("· 3")).toBeInTheDocument();
    const show = screen.getByRole("button", { name: "Show the tasks under Budget" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    await user.click(show);
    expect(screen.getByText("Collect quotes")).toBeInTheDocument();
  });

  it("keeps the delete target the end-to-end suite and people know", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<Harness onRemove={onRemove} />);
    expect(screen.getByRole("heading", { level: 2, name: "Budget" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete heading Budget" }));
    expect(onRemove).toHaveBeenCalled();
  });
});
