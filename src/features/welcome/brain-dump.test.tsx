// @vitest-environment jsdom
// Step 3, the brain dump (ONBOARDING.md §Step 3): the production composer in the page; each Enter is a real task
// on today unless the line names its own day; a paste is one task a line with one Undo; past twenty, the quiet
// line and the Inbox; either button ends the first run.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskDraft } from "@/core/quickadd";
import { instant, localDate } from "@/core/time";

const h = vi.hoisted(() => ({
  created: [] as { id: string; draft: TaskDraft; ctx: unknown }[],
  removed: [] as string[][],
  undo: [] as { label: string; toast?: boolean; undo: () => Promise<void> }[],
}));
vi.mock("@/data/powersync", () => ({
  useQuery: () => ({ data: [] }),
  useLocalDatabase: () => ({ getOptional: async () => null }),
}));
vi.mock("@/features/tasks/use-task-repo", () => ({
  useTaskRepo: () => ({
    create: async (draft: TaskDraft, ctx: unknown) => {
      const id = `t${h.created.length + 1}`;
      h.created.push({ id, draft, ctx });
      return id;
    },
    removeCreated: async (ids: string[]) => void h.removed.push([...ids]),
  }),
}));
vi.mock("@/features/undo/undo-provider", () => ({ useUndoSink: () => ({ record: (e: { label: string; toast?: boolean; undo: () => Promise<void> }) => void h.undo.push(e) }) }));

import { BrainDump } from "./brain-dump";

// Wednesday 7 October 2026.
const ctx = { now: instant("2026-10-07T08:00:00Z"), zone: "Europe/London", today: localDate("2026-10-07") };

function setup() {
  const onFinish = vi.fn();
  render(<BrainDump ctx={ctx} spaceId="s1" onFinish={onFinish} />);
  return { onFinish, user: userEvent.setup(), input: screen.getByRole("textbox", { name: "Task" }) };
}

beforeEach(() => {
  h.created = [];
  h.removed = [];
  h.undo = [];
});
afterEach(() => {
  delete document.documentElement.dataset.motion;
  vi.useRealTimers();
});

describe("<BrainDump>", () => {
  it("asks what is on the plate, with the hint and the first example; Next counts nothing yet", () => {
    const { input } = setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("What's on your plate today?");
    expect(screen.getByText("One per line. Don't organise anything — just get it out.")).toBeInTheDocument();
    expect(screen.getByText(/we’ll pick them up as you type/)).toHaveTextContent("Try 3pm, ~45m, #project, !1 — we’ll pick them up as you type.");
    expect(input).toHaveAttribute("placeholder", "Draft the proposal 3pm ~45m");
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    // Not a sheet: the composer sits in the page.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("each Enter saves a real task on today, which joins the rows above; the strip says Today while typing", async () => {
    const { user, input } = setup();
    await user.type(input, "Call the plumber ~30m");
    // The strip under the box restates the line as it will be saved: today, not the Inbox.
    const strip = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    expect(strip).toHaveTextContent("Today");
    expect(strip).not.toHaveTextContent("Inbox");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(h.created).toHaveLength(1));
    expect(h.created[0].draft.doDate?.toString()).toBe("2026-10-07");
    expect(h.created[0].draft.estimateMin).toBe(30);
    expect(h.created[0].ctx).toEqual({ spaceId: "s1", projectId: null });
    const rows = within(await screen.findByRole("list", { name: "On your plate" })).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Call the plumber");
    expect(rows[0]).toHaveTextContent("30m");
    expect(screen.getByRole("button", { name: "Next — 1 thing" })).toBeInTheDocument();
  });

  it("a line with its own day keeps it, and says so", async () => {
    const { user, input } = setup();
    await user.type(input, "Send the invoice friday{Enter}");
    await waitFor(() => expect(h.created).toHaveLength(1));
    expect(h.created[0].draft.doDate?.toString()).toBe("2026-10-09");
    expect(await screen.findByText("Friday — I'll keep it for then.")).toBeInTheDocument();
  });

  it("a pasted list is one task a line, and one Undo takes them all back", async () => {
    const { user, input } = setup();
    await user.click(input);
    await user.paste("Buy milk\nCall Dana\nPay rent");
    await waitFor(() => expect(h.created).toHaveLength(3));
    expect(h.created.every((c) => c.draft.doDate?.toString() === "2026-10-07")).toBe(true);
    expect(await screen.findByRole("button", { name: "Next — 3 things" })).toBeInTheDocument();
    expect(h.undo.map((u) => u.label)).toEqual(["3 tasks added"]);
    // The composer's notice carries the Undo; no toast over the step's buttons on a phone.
    expect(h.undo[0].toast).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent("3 tasks added");
    await h.undo[0].undo();
    expect(h.removed).toEqual([["t1", "t2", "t3"]]);
    await waitFor(() => expect(screen.queryByRole("list", { name: "On your plate" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("after the twentieth, the quiet line shows and the rest go to the Inbox", async () => {
    const { user, input } = setup();
    await user.click(input);
    await user.paste(Array.from({ length: 20 }, (_, i) => `Thing ${i + 1}`).join("\n"));
    await waitFor(() => expect(h.created).toHaveLength(20));
    expect(await screen.findByText("That's plenty for one day — the rest can live in your Inbox.")).toBeInTheDocument();
    await user.type(input, "Thing 21{Enter}");
    await waitFor(() => expect(h.created).toHaveLength(21));
    expect(h.created[19].draft.doDate?.toString()).toBe("2026-10-07");
    expect(h.created[20].draft.doDate).toBeNull();
  });

  it("both buttons end the first run", async () => {
    const { user, onFinish } = setup();
    await user.click(screen.getByRole("button", { name: "I’ll add things later" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(2));
    expect(h.created).toHaveLength(0);
  });

  it("a line still in the box (no Enter) is saved before the first run ends", async () => {
    const { user, input, onFinish } = setup();
    await user.type(input, "Call the dentist");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    expect(h.created).toHaveLength(1);
    expect(h.created[0].draft.title).toBe("Call the dentist");
    expect(h.created[0].draft.doDate?.toString()).toBe("2026-10-07");
  });

  it("a line with no name keeps the step on screen and says why", async () => {
    const { user, input, onFinish } = setup();
    await user.type(input, "tomorrow ~30m");
    await user.click(screen.getByRole("button", { name: "I’ll add things later" }));
    expect(await screen.findByText("Give it a name")).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
    expect(h.created).toHaveLength(0);
    expect(input).toHaveValue("tomorrow ~30m");
  });

  it("the placeholder moves through the three examples, and stays on the first for less motion", () => {
    vi.useFakeTimers();
    const first = render(<BrainDump ctx={ctx} spaceId="s1" onFinish={() => {}} />);
    const box = () => within(first.container).getByRole("textbox", { name: "Task" });
    expect(box()).toHaveAttribute("placeholder", "Draft the proposal 3pm ~45m");
    act(() => vi.advanceTimersByTime(2500));
    expect(box()).toHaveAttribute("placeholder", "Call the plumber");
    act(() => vi.advanceTimersByTime(2500));
    expect(box()).toHaveAttribute("placeholder", "Review PRs ~1h #work");
    first.unmount();

    document.documentElement.dataset.motion = "reduce";
    const still = render(<BrainDump ctx={ctx} spaceId="s1" onFinish={() => {}} />);
    act(() => vi.advanceTimersByTime(7500));
    expect(within(still.container).getByRole("textbox", { name: "Task" })).toHaveAttribute("placeholder", "Draft the proposal 3pm ~45m");
  });
});
