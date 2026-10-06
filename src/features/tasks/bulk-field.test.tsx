// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate, type LocalDate } from "@/core/time";

const updateMany = vi.fn().mockResolvedValue(undefined);
vi.mock("./use-task-repo", () => ({ useTaskRepo: () => ({ updateMany }) }));
vi.mock("@/features/shell/use-local-day", () => ({
  useNow: () => instant("2026-09-14T08:03:00Z"), // Monday 09:03 in London
  useLocalDay: () => ({ today: localDate("2026-09-14"), zone: "Europe/London", settings: null }),
}));

import { BulkField } from "./bulk-field";

function setup(field: "do" | "deadline" | "start" | "estimate") {
  updateMany.mockClear();
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(<BulkField ids={["t1", "t2", "t3"]} field={field} onDone={onDone} onClose={onClose} />);
  return { onDone, onClose, user: userEvent.setup() };
}

describe("<BulkField> (D, ⇧D, ⇧S, E with rows ticked)", () => {
  it("one typed date sets the do-date of every ticked task in one write, then the ticks clear", async () => {
    const { user, onDone, onClose } = setup("do");
    expect(screen.getByRole("dialog", { name: "Pick a date for 3 tasks" })).toBeInTheDocument();
    const typed = screen.getByRole("textbox", { name: "In words" });
    expect(typed).toHaveFocus();
    await user.type(typed, "fri 3pm{Enter}");
    expect(onClose).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(1);
    const [ids, patch, note] = updateMany.mock.calls[0];
    expect(ids).toEqual(["t1", "t2", "t3"]);
    expect(patch.doDate.toString()).toBe("2026-09-18");
    expect(patch.doTime.toString({ smallestUnit: "minute" })).toBe("15:00");
    expect(note).toBe("Moved {title}");
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("deadline and start take a date for all of them", async () => {
    const { user } = setup("deadline");
    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect((updateMany.mock.calls[0][1] as { deadline: LocalDate }).deadline.toString()).toBe("2026-09-21");
    expect(updateMany.mock.calls[0][2]).toBe("Set the deadline on {title}");
  });

  it("estimate sets the minutes for all of them", async () => {
    const { user } = setup("estimate");
    expect(screen.getByRole("dialog", { name: "Set estimate for 3 tasks" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "30m" }));
    expect(updateMany).toHaveBeenCalledWith(["t1", "t2", "t3"], { estimateMin: 30 }, "Estimated {title} at 30m");
  });
});
