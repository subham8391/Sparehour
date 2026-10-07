// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { Palette, type PaletteProps } from "./palette";
import { rankScoped } from "./palette-rank";
import type { Command } from "./registry";

afterEach(cleanup);

describe("rankScoped (G P / G A)", () => {
  const items = [
    { id: "p1", name: "Acme" },
    { id: "p2", name: "Website" },
    { id: "p3", name: "Acme redesign" },
    { id: "p4", name: "Platform" },
  ];
  it("lists every item on an empty query, the recently opened first", () => {
    expect(rankScoped("", items, ["p4", "p2"]).map((i) => i.id)).toEqual(["p4", "p2", "p1", "p3"]);
  });
  it("fuzzy-matches with a query, best first, recency breaking ties", () => {
    expect(rankScoped("acme", items, ["p3"]).map((i) => i.id)).toEqual(["p1", "p3"]);
    expect(rankScoped("pltf", items).map((i) => i.id)).toEqual(["p4"]);
    expect(rankScoped("zzz", items)).toEqual([]);
  });
});

describe("<Palette> scoped (G P / G A, SCREENS.md §24)", () => {
  const commands: Command[] = [{ id: "create.task", title: "Add task", group: "Create", shortcut: "q", run: () => {} }];
  const base = (over: Partial<PaletteProps>): PaletteProps => ({
    open: true,
    commands,
    availability: () => ({ enabled: true }),
    recents: [],
    projects: [
      { id: "p1", name: "Acme", href: "/project/p1" },
      { id: "p2", name: "Website", href: "/project/p2" },
    ],
    areas: [{ id: "a1", name: "Work", href: "/area/a1" }],
    tasks: [],
    today: localDate("2026-10-07"),
    isMac: true,
    onQueryChange: vi.fn(),
    onRun: vi.fn(),
    onOpenTask: vi.fn(),
    onGo: vi.fn(),
    onAddTask: vi.fn(),
    onClose: vi.fn(),
    ...over,
  });

  it("G P lists only the open projects, the recently opened first, and Enter opens the top match", async () => {
    const props = base({ scope: "projects", places: ["p2"] });
    render(<Palette {...props} />);
    const input = screen.getByRole("combobox", { name: "Go to project" });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["WebsiteProject", "AcmeProject"]);
    await userEvent.setup().type(input, "acm{Enter}");
    expect(props.onGo).toHaveBeenCalledWith("/project/p1");
    expect(props.onAddTask).not.toHaveBeenCalled();
    expect(props.onRun).not.toHaveBeenCalled();
  });

  it("G A lists the areas alone", () => {
    render(<Palette {...base({ scope: "areas" })} />);
    expect(screen.getByRole("dialog", { name: "Go to area" })).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["WorkArea"]);
  });
});
