// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { LogbookFilterBar } from "./logbook-filter-bar";
import { toLogbookParams, type LogbookFilters } from "./logbook-filters";

const options = {
  projects: [
    { id: "p1", name: "Launch" },
    { id: "p2", name: "Garden" },
  ],
  areas: [{ id: "a1", name: "Work" }],
  tags: [{ name: "deep" }],
};
const today = localDate("2026-10-07");

function Harness({ initial = {}, onUrl }: { initial?: LogbookFilters; onUrl: (q: string) => void }) {
  const [filters, setFilters] = useState<LogbookFilters>(initial);
  return (
    <LogbookFilterBar
      filters={filters}
      onChange={(f) => {
        setFilters(f);
        onUrl(toLogbookParams(f));
      }}
      options={options}
      today={today}
    />
  );
}

describe("<LogbookFilterBar> (SCREENS.md §8)", () => {
  it("inline from 640 px: Done | Dropped and a menu per filter; each choice becomes a removable chip in the URL", async () => {
    const onUrl = vi.fn();
    render(<Harness onUrl={onUrl} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Dropped" }));
    await user.click(screen.getByRole("button", { name: "Filter by project" }));
    await user.click(screen.getByRole("menuitem", { name: "#Launch" }));
    await user.click(screen.getByRole("button", { name: "Filter by dates" }));
    await user.click(screen.getByRole("menuitem", { name: "Yesterday" }));
    expect(onUrl).toHaveBeenLastCalledWith("show=dropped&project=p1&from=2026-10-06&to=2026-10-06");
    expect(screen.getByText("Dropped only")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove filter #Launch" }));
    expect(onUrl).toHaveBeenLastCalledWith("show=dropped&from=2026-10-06&to=2026-10-06");
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onUrl).toHaveBeenLastCalledWith("");
    expect(screen.queryByRole("button", { name: /Remove filter/ })).toBeNull();
  });

  it("on a phone a Filter button opens the same filters as a bottom sheet of 44 px rows", async () => {
    const onUrl = vi.fn();
    render(<Harness onUrl={onUrl} initial={{ tag: "deep" }} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Filter · 1/ }));
    const sheet = await screen.findByRole("dialog", { name: "Filter the Logbook" });
    const area = within(sheet).getByRole("radio", { name: "Work" });
    expect(area.className).toMatch(/min-h-11/);
    await user.click(area);
    expect(onUrl).toHaveBeenLastCalledWith("tag=deep&area=a1");
    // A second tap on the chosen row takes it off.
    await user.click(within(sheet).getByRole("radio", { name: "@deep" }));
    expect(onUrl).toHaveBeenLastCalledWith("area=a1");
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove filter Work" })).toBeInTheDocument();
  });
});
