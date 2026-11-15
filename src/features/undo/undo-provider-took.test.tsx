// @vitest-environment jsdom
// A completion's toast asks how long the task took (DECISIONS.md, amendment 2026-11-15): the chips sit under the
// words and Undo, only for a write that names the row to record it on.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TookAsk } from "@/data/repositories/undo";

vi.mock("@/features/took/took-chips", () => ({
  TookChips: ({ ask }: { ask: TookAsk }) => (
    <div data-testid="took">
      {ask.table}:{ask.id}
    </div>
  ),
}));

const { UndoProvider, useUndo } = await import("./undo-provider");

function Harness() {
  const { record } = useUndo();
  const undo = async () => {};
  return (
    <div>
      <button type="button" onClick={() => record({ label: "Completed “Write the report”", toast: true, took: { table: "tasks", id: "t1" }, rows: { tasks: ["t1"] }, undo })}>
        complete
      </button>
      <button type="button" onClick={() => record({ label: "Completed 2 tasks", toast: true, rows: { tasks: ["t1", "t2"] }, undo })}>
        complete two
      </button>
    </div>
  );
}

describe("<UndoProvider> and Took", () => {
  it("asks under the toast of one finished task, and goes with the toast", async () => {
    const user = userEvent.setup();
    render(
      <UndoProvider>
        <Harness />
      </UndoProvider>,
    );
    await user.click(screen.getByRole("button", { name: "complete" }));
    expect(await screen.findByTestId("took")).toHaveTextContent("tasks:t1");
    expect(screen.getByRole("status")).toContainElement(screen.getByTestId("took"));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByTestId("took")).not.toBeInTheDocument();
  });

  it("does not ask when several were finished at once", async () => {
    const user = userEvent.setup();
    render(
      <UndoProvider>
        <Harness />
      </UndoProvider>,
    );
    await user.click(screen.getByRole("button", { name: "complete two" }));
    expect(screen.getByRole("status")).toHaveTextContent("Completed 2 tasks");
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("took")).not.toBeInTheDocument();
  });
});
