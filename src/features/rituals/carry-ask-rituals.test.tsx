// @vitest-environment jsdom
// The three-carry ask in the morning review and the morning plan (SCREENS.md §2.3, §2.3a, §14 step 2): the same
// four answers in the same order, the same two-a-day record, and Break it down converting the task.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant } from "@/core/time";
import { TODAY, taskFixture } from "@/test/fixtures";
import { CarryReviewSheet, REVIEW_LABEL } from "./carry-review-sheet";
import { MorningPlanFlow, type MorningPlanFlowProps } from "./morning-plan-flow";

// Nothing asked yet today on this device.
vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: [], isLoading: false }) }));

const yesterday = TODAY.subtract({ days: 1 });
const NOW = instant("2026-09-14T08:00:00Z");
const pile = [
  taskFixture("a", "Book the dentist", { doDate: yesterday, carryCount: 4 }),
  taskFixture("b", "Renew the car insurance", { doDate: yesterday, carryCount: 3 }),
  taskFixture("c", "Write the roadmap", { doDate: yesterday, carryCount: 3 }),
  taskFixture("d", "Call the plumber", { doDate: yesterday, carryCount: 1 }),
];

function review() {
  const repo = {
    reschedule: vi.fn(async () => {}),
    updateMany: vi.fn(async () => {}),
    setState: vi.fn(async () => {}),
    setStateMany: vi.fn(async () => {}),
    markAsked: vi.fn(async () => {}),
    convertToProject: vi.fn(async (id: string) => ({ projectId: `project-${id}` })),
  };
  const h = { onStamp: vi.fn(async () => {}), onClose: vi.fn(), onOpenProject: vi.fn() };
  render(<CarryReviewSheet tasks={pile} today={TODAY} repo={repo} carryAskAfter={3} zone="UTC" now={NOW} {...h} />);
  return { repo, ...h, user: userEvent.setup() };
}

const choiceFor = (title: string) => within(screen.getByRole("dialog", { name: REVIEW_LABEL })).getByRole("radiogroup", { name: `Choice for ${title}` });

describe("the morning review's ask", () => {
  it("asks on the first two at the threshold in carried order, with the ask's four answers, and records them", async () => {
    const { repo } = review();
    const answers = (title: string) => within(choiceFor(title)).getAllByRole("radio").map((r) => r.textContent);
    expect(answers("Book the dentist")).toEqual(["Keep today", "Someday", "Break it down", "Drop"]);
    expect(answers("Renew the car insurance")).toEqual(["Keep today", "Someday", "Break it down", "Drop"]);
    // The third at the threshold waits for another day; one under it never asks.
    expect(answers("Write the roadmap")).toEqual(["Keep", "Tomorrow", "Someday", "Drop"]);
    expect(answers("Call the plumber")).toEqual(["Keep", "Tomorrow", "Someday", "Drop"]);
    await waitFor(() => expect(repo.markAsked).toHaveBeenCalledWith(["a", "b"], expect.any(String)));
  });

  it("Break it down converts at Done, after the other answers and the stamp, and opens the new project", async () => {
    const { repo, user, onStamp, onClose, onOpenProject } = review();
    await user.click(within(choiceFor("Book the dentist")).getByRole("radio", { name: "Break it down" }));
    await user.click(within(choiceFor("Renew the car insurance")).getByRole("radio", { name: "Someday" }));
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(onOpenProject).toHaveBeenCalledWith("project-a"));
    expect(repo.convertToProject).toHaveBeenCalledWith("a");
    expect(repo.convertToProject).toHaveBeenCalledTimes(1);
    expect(repo.setState).toHaveBeenCalledWith("b", "someday");
    // Keep for the rest; the converted task is not also rescheduled.
    expect(repo.updateMany).toHaveBeenCalledWith(["c", "d"], expect.anything(), expect.any(String));
    expect(repo.reschedule).not.toHaveBeenCalled();
    expect(onStamp).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("the morning plan's ask", () => {
  function plan(over: Partial<MorningPlanFlowProps> = {}) {
    const h = { onPick: vi.fn(), onCarry: vi.fn(), onMoveToTomorrow: vi.fn(), onDone: vi.fn(), onSkip: vi.fn(), onBreakDown: vi.fn() };
    render(
      <MorningPlanFlow
        capacity={null}
        groups={{ carried: [pile[0], pile[2]], dueThisWeek: [], fromProjects: [] }}
        onToday={[]}
        fitsMin={300}
        tomorrowSpareMin={200}
        defaultEstimateMin={30}
        asks={new Set(["a"])}
        today={TODAY}
        now={NOW}
        zone="UTC"
        {...h}
        {...over}
      />,
    );
    return { ...h, user: userEvent.setup() };
  }

  it("shows the ask only where Today does, in place of the row's moves; Break it down hands the task over", async () => {
    const { user, onBreakDown, onCarry } = plan();
    await user.click(screen.getByRole("button", { name: "Step 2: Pick today’s tasks" }));
    const ask = screen.getByRole("group", { name: "Still want this?" });
    expect(within(ask).getAllByRole("button").map((b) => b.textContent)).toEqual(["Keep today", "Someday", "Break it down", "Drop"]);
    expect(screen.getAllByRole("group", { name: "Still want this?" })).toHaveLength(1);
    // The asked row has no moves of its own; the other carried row keeps its Today · Tomorrow · Someday · Drop.
    const askedRow = screen.getByText("Book the dentist").closest("li") as HTMLElement;
    expect(within(askedRow).queryByRole("button", { name: "Tomorrow" })).not.toBeInTheDocument();
    const otherRow = screen.getByText("Write the roadmap").closest("li") as HTMLElement;
    expect(within(otherRow).getByRole("button", { name: "Tomorrow" })).toBeInTheDocument();
    await user.click(within(ask).getByRole("button", { name: "Break it down" }));
    expect(onBreakDown).toHaveBeenCalledWith("a");
    await user.click(within(ask).getByRole("button", { name: "Keep today" }));
    expect(onCarry).toHaveBeenCalledWith("a", "today");
  });
});
