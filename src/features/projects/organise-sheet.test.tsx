// @vitest-environment jsdom
// The tap path for organising areas and projects: Move up, Move down, Move to area… and Delete area… (with the
// counts of what stays), each one write through the repositories.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  areaRepo: { move: vi.fn(), remove: vi.fn() },
  projectRepo: { move: vi.fn() },
  contents: [{ projects: 2, tasks: 1 }] as { projects: number; tasks: number }[],
}));
vi.mock("@/data/powersync", () => ({ useQuery: (sql: string) => ({ data: sql.includes("where 0") ? [] : h.contents }) }));
vi.mock("@/features/tasks/use-repos", () => ({ useAreaRepo: () => h.areaRepo, useProjectRepo: () => h.projectRepo }));
vi.mock("@/features/shell/use-nav-data", () => ({
  useNavData: () => ({
    counts: { inbox: 0, today: 0 },
    areas: [
      { id: "work", name: "Work", projects: [{ id: "q4", name: "Q4 launch" }, { id: "hiring", name: "Hiring" }] },
      { id: "home", name: "Home", projects: [{ id: "kitchen", name: "Kitchen" }] },
      { id: "__loose", name: "Projects", loose: true, projects: [{ id: "side", name: "Side thing" }] },
    ],
  }),
}));

import { OrganiseSheet, deleteAreaNote } from "./organise-sheet";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<OrganiseSheet> for an area", () => {
  it("offers Move up (not for the first), Move down and Delete area…", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrganiseSheet target={{ kind: "area", id: "work", name: "Work" }} onClose={onClose} />);
    const menu = screen.getByRole("menu", { name: "Organise Work" });
    expect(within(menu).getByRole("menuitem", { name: /Move up/ })).toBeDisabled();
    await user.click(within(menu).getByRole("menuitem", { name: /Move down/ }));
    expect(h.areaRepo.move).toHaveBeenCalledWith("work", 1);
    expect(onClose).toHaveBeenCalled();
  });

  it("Delete area… says what stays, and Delete removes only the area", async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    render(<OrganiseSheet target={{ kind: "area", id: "home", name: "Home" }} onClose={vi.fn()} onDeleted={onDeleted} />);
    await user.click(screen.getByRole("menuitem", { name: "Delete area…" }));
    expect(screen.getByRole("heading", { name: "Delete “Home”?" })).toBeInTheDocument();
    expect(screen.getByText("Its 2 projects and 1 task stay, without an area.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete area" }));
    expect(h.areaRepo.remove).toHaveBeenCalledWith("home");
    expect(onDeleted).toHaveBeenCalled();
  });

  it("Keep leaves it", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<OrganiseSheet target={{ kind: "area", id: "home", name: "Home" }} step="delete" onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Keep" }));
    expect(h.areaRepo.remove).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("<OrganiseSheet> for a project", () => {
  it("moves up within its area", async () => {
    const user = userEvent.setup();
    render(<OrganiseSheet target={{ kind: "project", id: "hiring", name: "Hiring" }} onClose={vi.fn()} />);
    expect(screen.getByRole("menuitem", { name: /Move down/ })).toBeDisabled();
    await user.click(screen.getByRole("menuitem", { name: /Move up/ }));
    expect(h.projectRepo.move).toHaveBeenCalledWith("hiring", { areaId: "work", index: 0 });
  });

  it("Move to area… lists the areas with its own checked, and files it last in the one chosen", async () => {
    const user = userEvent.setup();
    render(<OrganiseSheet target={{ kind: "project", id: "q4", name: "Q4 launch" }} onClose={vi.fn()} />);
    await user.click(screen.getByRole("menuitem", { name: "Move to area…" }));
    const list = screen.getByRole("menu", { name: "Areas" });
    expect(within(list).getAllByRole("menuitemradio").map((b) => b.textContent)).toEqual(["Work", "Home", "No area"]);
    expect(within(list).getByRole("menuitemradio", { name: "Work" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(list).getByRole("menuitemradio", { name: "Home" }));
    expect(h.projectRepo.move).toHaveBeenCalledWith("q4", { areaId: "home", index: 1 }, "Home");
  });

  it("No area takes it out of every area; its own area changes nothing", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<OrganiseSheet target={{ kind: "project", id: "q4", name: "Q4 launch" }} step="move" onClose={vi.fn()} />);
    await user.click(screen.getByRole("menuitemradio", { name: "Work" }));
    expect(h.projectRepo.move).not.toHaveBeenCalled();
    unmount();
    render(<OrganiseSheet target={{ kind: "project", id: "q4", name: "Q4 launch" }} step="move" onClose={vi.fn()} />);
    await user.click(screen.getByRole("menuitemradio", { name: "No area" }));
    expect(h.projectRepo.move).toHaveBeenCalledWith("q4", { areaId: null, index: 1 }, null);
  });
});

describe("deleteAreaNote", () => {
  it("names what stays, or that nothing is filed there", () => {
    expect(deleteAreaNote(0, 0)).toBe("Nothing is filed in it.");
    expect(deleteAreaNote(1, 0)).toBe("Its 1 project stays, without an area.");
    expect(deleteAreaNote(0, 3)).toBe("Its 3 tasks stay, without an area.");
  });
});
