// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FEATURED_LOOKS, readyLooks, shownLooks } from "./catalog";
import { LookPicker } from "./look-picker";

afterEach(cleanup);

const names = () => within(screen.getByRole("group", { name: "Look" })).getAllByRole("radio").map((r) => r.closest("label")?.querySelector("span.font-medium")?.textContent);

function Picker({ start, onChange }: { start: string; onChange: (id: string) => void }) {
  const [value, setValue] = useState(start);
  return (
    <LookPicker
      value={value}
      onChange={(id) => {
        setValue(id);
        onChange(id);
      }}
    />
  );
}
describe("<LookPicker> opens on three looks (DECISIONS.md, amendment 2026-11-14)", () => {
  it("shows Sky, Daylight and Indigo, with the rest one tap away and none removed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picker start="sky" onChange={onChange} />);
    expect(names()).toEqual(["Sky", "Daylight", "Indigo"]);
    const total = readyLooks().length;
    const more = screen.getByRole("button", { name: `More looks (${total - 3})` });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveAttribute("aria-controls", screen.getByRole("group", { name: "Look" }).id);

    await user.click(more);
    expect(names()).toHaveLength(total);
    expect(names()?.slice(0, 3)).toEqual(["Sky", "Daylight", "Timetable"]);
    const fewer = screen.getByRole("button", { name: "Fewer looks" });
    expect(fewer).toHaveAttribute("aria-expanded", "true");
    await user.click(fewer);
    expect(names()).toEqual(["Sky", "Daylight", "Indigo"]);
  });

  it("a person on another look sees it beside the three, checked", () => {
    render(<Picker start="terminal" onChange={vi.fn()} />);
    expect(names()).toEqual(["Sky", "Daylight", "Indigo", "Terminal"]);
    expect(screen.getByRole("radio", { name: /Terminal/ })).toBeChecked();
    expect(screen.getByRole("button", { name: `More looks (${readyLooks().length - 4})` })).toBeInTheDocument();
  });

  it("a look tried from the rest stays in sight after they are folded away, so the way back is one tap", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Picker start="sky" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: /^More looks/ }));
    await user.click(screen.getByRole("radio", { name: /Casio/ }));
    expect(onChange).toHaveBeenLastCalledWith("casio");
    await user.click(screen.getByRole("button", { name: "Fewer looks" }));
    expect(names()).toEqual(["Sky", "Daylight", "Casio", "Indigo"]);
    await user.click(screen.getByRole("radio", { name: /Sky/ }));
    expect(names()).toEqual(["Sky", "Daylight", "Casio", "Indigo"]);
  });

  it("the three are real, ready looks, and the catalogue keeps its order", () => {
    const ids = readyLooks().map((l) => l.id);
    for (const id of FEATURED_LOOKS) expect(ids).toContain(id);
    expect(shownLooks(false).map((l) => l.id)).toEqual(["sky", "daylight", "indigo"]);
    expect(shownLooks(true).map((l) => l.id)).toEqual(ids);
  });
});
