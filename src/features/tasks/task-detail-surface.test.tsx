// @vitest-environment jsdom
// Where the task detail appears (SCREENS.md §1 rules 5 and 6, DESIGN_SYSTEM.md §4a): below the medium band (900 px)
// it covers the list, the narrow band's side sheet included, so it is a modal dialog there; from 900 px it is a
// pane beside the list with its resizable edge.
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DetailSurface } from "./task-detail-surface";

vi.mock("next/navigation", () => ({ usePathname: () => "/inbox" }));
vi.mock("./task-detail-connected", () => ({ TaskDetail: () => <p>detail</p> }));

/** A viewport `width` px wide, as matchMedia answers min- and max-width queries in px or rem. */
function viewport(width: number) {
  vi.stubGlobal("matchMedia", (q: string) => {
    const m = /(min|max)-width: ([\d.]+)(px|rem)/.exec(q);
    const px = m ? Number(m[2]) * (m[3] === "rem" ? 16 : 1) : NaN;
    return { matches: m ? (m[1] === "min" ? width >= px : width <= px) : false, addEventListener() {}, removeEventListener() {} };
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("<DetailSurface>", () => {
  it.each([360, 700, 820, 899])("at %i px it is a modal dialog over the list", (width) => {
    viewport(width);
    render(<DetailSurface id="t1" field={null} onClose={() => {}} />);
    const sheet = screen.getByRole("dialog", { name: "Task" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
  });

  it("from 900 px it is a pane beside the list, with its edge", () => {
    viewport(900);
    render(<DetailSurface id="t1" field={null} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("complementary", { name: "Task" })).not.toHaveAttribute("aria-modal");
    expect(screen.getByRole("separator", { name: "Resize the task pane" })).toBeInTheDocument();
  });
});
