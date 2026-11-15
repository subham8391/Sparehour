// @vitest-environment jsdom
// "Took" under a completion's toast: four lengths around what the task was counted as, More for the rest, one tap
// records it, the same tap again takes it back, and it still writes once sync has taken the finished row away.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";

const h = vi.hoisted(() => ({ s: null as unknown as ReturnType<typeof import("@/test/local-sqlite").localSqlite> | null, old: 0 }));
vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => h.s?.db ?? null }));
vi.mock("@/features/estimates/learned-store", () => ({ learnedIsOld: () => void (h.old += 1) }));

const { TookChips } = await import("./took-chips");

const TASK = { table: "tasks", id: "t1" } as const;
const names = () => screen.getAllByRole("button").map((b) => b.textContent);

beforeEach(() => {
  h.s = localSqlite();
  h.old = 0;
  h.s.insert("tasks", { id: "t1", space_id: "s1", title: "Write the report", state: "done", completed_at: "2026-11-16T10:00:00Z", estimate_min: 30, sort_key: "a0" });
});

describe("<TookChips>", () => {
  it("offers four lengths around the estimate, then More", async () => {
    render(<TookChips ask={TASK} />);
    const group = await screen.findByRole("group", { name: "How long it took" });
    expect(group).toHaveTextContent("Took");
    expect(names()).toEqual(["15m", "30m", "45m", "1h", "More"]);
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("goes by the account's default for a task with no estimate", async () => {
    h.s!.insert("user_settings", { id: "u1", space_id: "s1", user_id: "u1", default_estimate_min: 60 });
    h.s!.insert("tasks", { id: "t2", space_id: "s1", title: "Call the bank", state: "done", completed_at: "2026-11-16T10:00:00Z", sort_key: "a1" });
    render(<TookChips ask={{ table: "tasks", id: "t2" }} />);
    await screen.findByRole("group", { name: "How long it took" });
    expect(names()).toEqual(["45m", "1h", "1h 30m", "2h", "More"]);
  });

  it("records a tap, shows it pressed, and marks what was learned as old", async () => {
    const user = userEvent.setup();
    render(<TookChips ask={TASK} />);
    await user.click(await screen.findByRole("button", { name: "45m" }));
    expect(screen.getByRole("button", { name: "45m" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(h.s!.row("tasks", "t1")?.actual_min).toBe(45));
    await waitFor(() => expect(h.old).toBe(1));
    // A tap lets go of the chip, so the toast it sits in is not held open by its focus.
    expect(screen.getByRole("button", { name: "45m" })).not.toHaveFocus();
  });

  it("changes the answer, and takes it back when the pressed one is tapped again", async () => {
    const user = userEvent.setup();
    render(<TookChips ask={TASK} />);
    await user.click(await screen.findByRole("button", { name: "45m" }));
    await user.click(screen.getByRole("button", { name: "1h" }));
    await waitFor(() => expect(h.s!.row("tasks", "t1")?.actual_min).toBe(60));
    expect(screen.getByRole("button", { name: "45m" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "1h" }));
    await waitFor(() => expect(h.s!.row("tasks", "t1")?.actual_min).toBeNull());
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("More shows every preset and keeps the answer among them; Fewer goes back", async () => {
    const user = userEvent.setup();
    render(<TookChips ask={TASK} />);
    await user.click(await screen.findByRole("button", { name: "More" }));
    expect(names()).toEqual(["15m", "30m", "45m", "1h", "1h 30m", "2h", "3h", "4h", "Fewer"]);
    await user.click(screen.getByRole("button", { name: "3h" }));
    await waitFor(() => expect(h.s!.row("tasks", "t1")?.actual_min).toBe(180));
    expect(screen.getByRole("button", { name: "Fewer" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Fewer" }));
    expect(names()).toEqual(["15m", "30m", "45m", "1h", "More"]);
  });

  it("still records after sync has taken the finished row off the device", async () => {
    const user = userEvent.setup();
    render(<TookChips ask={TASK} />);
    await screen.findByRole("group", { name: "How long it took" });
    h.s!.drop("tasks", "t1");
    await user.click(screen.getByRole("button", { name: "1h" }));
    await waitFor(() => expect(h.s!.row("tasks", "t1")).toMatchObject({ state: "done", title: "Write the report", actual_min: 60 }));
  });

  it("shows what is already recorded", async () => {
    h.s!.insert("task_completions", { id: "c1", space_id: "s1", task_id: "t1", occurrence_date: "2026-11-16", completed_at: "2026-11-16T10:00:00Z", actual_min: 45 });
    render(<TookChips ask={{ table: "task_completions", id: "c1" }} />);
    expect(await screen.findByRole("button", { name: "45m" })).toHaveAttribute("aria-pressed", "true");
  });

  it("draws nothing when the row is not on the device, or there is no database", async () => {
    const { container, rerender } = render(<TookChips ask={{ table: "tasks", id: "gone" }} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    h.s = null;
    rerender(<TookChips ask={TASK} />);
    expect(container).toBeEmptyDOMElement();
  });
});
