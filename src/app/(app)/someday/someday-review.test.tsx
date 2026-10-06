// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import type { TaskRow } from "@/data/schema.client";

const execute = vi.fn().mockResolvedValue(undefined);
const getAll = vi.fn().mockResolvedValue([]);
const getOptional = vi.fn().mockResolvedValue(null);

vi.mock("@/data/powersync", () => ({
  useLocalDatabase: () => ({ execute, getAll, getOptional, writeTransaction: async (fn: (tx: unknown) => Promise<void>) => fn({ execute, getAll, getOptional }) }),
}));

import { SomedayReview } from "./someday-review";

const rows = [
  { id: "t1", title: "Learn the cello", project_id: "p1", last_touched_at: "2026-09-01 10:00:00+00", auto_filed_at: "2026-10-06 03:00:00+00" },
  { id: "t2", title: "Repaint the fence", project_id: null, last_touched_at: "2026-09-02 10:00:00+00", auto_filed_at: "2026-10-06 03:00:00+00" },
] as TaskRow[];

describe("<SomedayReview> (SCREENS.md §7 Review)", () => {
  it("walks the batch one task at a time: Keep in Someday clears the stamp, Drop drops, then it says it is done", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SomedayReview tasks={rows} today={localDate("2026-10-06")} zone="UTC" projectNames={new Map([["p1", "Music"]])} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Review what moved to Someday" })).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Learn the cello" })).toBeInTheDocument();
    expect(screen.getByText("Music · Last touched Tue 1 Sep")).toBeInTheDocument();
    for (const name of ["Keep in Someday", "Today", "Drop"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.getByLabelText("Pick a date for Learn the cello")).toHaveAttribute("type", "date");

    await user.click(screen.getByRole("button", { name: "Keep in Someday" }));
    expect(String(execute.mock.calls[0][0])).toBe("update tasks set auto_filed_at = null, updated_at = ? where id in (?) and state = 'someday'");
    expect(await screen.findByText("2 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Drop" }));
    expect(execute.mock.calls.some((c) => String(c[0]).startsWith("update tasks set state = ?") && c[1][0] === "dropped" && c[1].at(-1) === "t2")).toBe(true);
    expect(await screen.findByText("That’s all of them.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});
