// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import { QuickAdd, type QuickAddSave, type QuickAddSubmission } from "./quick-add";

const ctx = { now: instant("2026-09-11T08:00:00Z"), zone: "Europe/London", today: localDate("2026-09-11") };
const projects = [
  { id: "p1", name: "Acme" },
  { id: "p2", name: "Website" },
];

function setup(over: Partial<React.ComponentProps<typeof QuickAdd>> = {}) {
  const onSubmit = vi.fn<(s: QuickAddSubmission) => Promise<void>>().mockResolvedValue();
  const onClose = vi.fn();
  render(<QuickAdd open projects={projects} ctx={ctx} onClose={onClose} onSubmit={onSubmit} {...over} />);
  return { onSubmit, onClose, input: screen.getByRole("textbox", { name: "Task" }), user: userEvent.setup() };
}

describe("<QuickAdd>", () => {
  it("a save that fails keeps the words in the box and says why; the next save clears the message", async () => {
    const onSubmit = vi
      .fn<(s: QuickAddSubmission) => Promise<void>>()
      .mockRejectedValueOnce(new Error("Your account is still loading — try again in a moment."))
      .mockResolvedValueOnce();
    const { user, input } = setup({ onSubmit });
    await user.type(input, "Call Dana{Enter}");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save “Call Dana”: Your account is still loading — try again in a moment."));
    expect(input).toHaveValue("Call Dana");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Added “Call Dana”"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("brain-dump: Enter clears at once, and a line typed while the last one is still saving is kept and saved next", async () => {
    // Seen in the walkthrough: a save took a second, the late clear erased the next line being typed.
    let finish!: () => void;
    const onSubmit = vi
      .fn<(s: QuickAddSubmission) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
      .mockResolvedValue();
    const { user, input } = setup({ onSubmit });
    await user.type(input, "Buy printer ink{Enter}");
    expect(input).toHaveValue("");
    await user.type(input, "Order new chair");
    finish();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Added “Buy printer ink”"));
    expect(input).toHaveValue("Order new chair");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls.map((c) => c[0].draft.title)).toEqual(["Buy printer ink", "Order new chair"]);
  });

  it("keys typed while the sheet was loading arrive as a longer opening line and are all kept", async () => {
    const onSubmit = vi.fn<(s: QuickAddSubmission) => Promise<void>>().mockResolvedValue();
    const { rerender } = render(<QuickAdd open initial="P" projects={projects} ctx={ctx} onClose={vi.fn()} onSubmit={onSubmit} />);
    rerender(<QuickAdd open initial="Pi" projects={projects} ctx={ctx} onClose={vi.fn()} onSubmit={onSubmit} />);
    rerender(<QuickAdd open initial="Pic" projects={projects} ctx={ctx} onClose={vi.fn()} onSubmit={onSubmit} />);
    expect(screen.getByRole("textbox", { name: "Task" })).toHaveValue("Pic");
  });

  it("restates the parse as chips as you type and paints the tokens", async () => {
    const { user, input } = setup();
    await user.type(input, "Draft proposal tomorrow 3pm ~45m #acme !1");
    // One chip per fact, in reading order, then where it lands; the live region reads them with the strip's separators.
    const strip = input.getAttribute("aria-describedby")!;
    expect(document.getElementById(strip)).toHaveTextContent("Tomorrow 15:00 · 45m · Acme · priority 1 → Upcoming");
    expect(screen.getByText("Tomorrow 15:00").className).toContain("bg-surface-2");
    expect(screen.getByText("Acme").className).toContain("bg-meet-soft");
    expect(screen.getByText("Upcoming")).toBeInTheDocument();
    const painted = document.querySelectorAll("mark[data-kind]");
    expect([...painted].map((m) => m.getAttribute("data-kind"))).toEqual(["datetime", "datetime", "estimate", "project", "priority"]);
  });

  it("Enter saves, resolves the project, clears the line and stays open", async () => {
    const { user, input, onSubmit, onClose } = setup();
    await user.type(input, "Email Sam #acme{Enter}");
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const s = onSubmit.mock.calls[0][0];
    expect(s.draft.title).toBe("Email Sam");
    expect(s.projectId).toBe("p1");
    expect(s.createProjectName).toBeNull();
    expect(input).toHaveValue("");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Added “Email Sam”");
    expect(input).toHaveFocus();
  });

  it("⌘Enter saves and closes; Escape discards", async () => {
    const { user, input, onSubmit, onClose } = setup();
    await user.type(input, "Call Dana{Meta>}{Enter}{/Meta}");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    await user.type(input, "{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers to create an unknown project and Tab accepts", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "Write post #blog");
    expect(screen.getByRole("button", { name: /Create “blog”/ })).toBeInTheDocument();
    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: /Will create “blog”/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/new project blog/)).toBeInTheDocument();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ projectId: null, createProjectName: "blog" });
    expect(onSubmit.mock.calls[0][0].draft.projectCreate).toBe(true);
  });

  it("Tab on a partial name completes it to the suggested project", async () => {
    const { user, input } = setup();
    await user.type(input, "Ship it #web");
    expect(screen.getByRole("button", { name: "Website" })).toBeInTheDocument();
    await user.keyboard("{Tab}");
    expect(input).toHaveValue("Ship it #Website");
    // The project chip, then where the task lands: filed in a project, it is not the Inbox (PRODUCT_SPEC.md §5.1 rule 5).
    expect(document.getElementById(input.getAttribute("aria-describedby")!)).toHaveTextContent("Website → Website");
    expect(screen.queryByText("Inbox")).not.toBeInTheDocument();
  });

  it("does not save an empty title", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "wed{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("a multi-line paste adds one task per line", async () => {
    const { user, input, onSubmit } = setup();
    await user.click(input);
    await user.paste("Buy milk\nCall Dana tmr\n\nPay rent {fri}\n");
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(3));
    expect(onSubmit.mock.calls.map((c) => c[0].draft.title)).toEqual(["Buy milk", "Call Dana", "Pay rent"]);
    expect(screen.getByRole("status")).toHaveTextContent("3 tasks added");
    expect(input).toHaveValue("");
  });

  it("suggestion chips append tokens", async () => {
    const { user, input } = setup({ initial: "Review deck" });
    await user.click(screen.getByRole("button", { name: "~45m" }));
    expect(input).toHaveValue("Review deck ~45m");
    expect(screen.getByText("45m")).toBeInTheDocument();
  });

  describe("a partial #project (PRODUCT_SPEC.md §5.2: fuzzy match, else offer to create)", () => {
    // Seen in the walkthrough: "#Q4" showed "Q4?", and Enter saved the task with no project and "#Q4" gone from the title.
    const withQ4 = [...projects, { id: "p3", name: "Q4 planning" }, { id: "p4", name: "Acme redesign" }];

    it("files the task in the one project the name fits, says so in the strip first and in the notice after", async () => {
      const { user, input, onSubmit } = setup({ projects: withQ4 });
      await user.type(input, "Email the accountant #Q4");
      expect(document.getElementById(input.getAttribute("aria-describedby")!)).toHaveTextContent("Q4 planning → Q4 planning");
      // Create stays on offer, and Tab still completes the name.
      expect(screen.getByRole("button", { name: /Create “Q4”/ })).toBeInTheDocument();
      await user.keyboard("{Enter}");
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ projectId: "p3", createProjectName: null });
      expect(onSubmit.mock.calls[0][0].draft.title).toBe("Email the accountant");
      expect(screen.getByRole("status")).toHaveTextContent("Added “Email the accountant” to Q4 planning");
    });

    it("a name that fits no project files nothing and keeps its words in the title", async () => {
      const { user, input, onSubmit } = setup({ projects: withQ4 });
      await user.type(input, "Email the accountant #taxes tomorrow{Enter}");
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const s = onSubmit.mock.calls[0][0];
      expect(s).toMatchObject({ projectId: null, createProjectName: null });
      expect(s.draft.title).toBe("Email the accountant #taxes");
      expect(s.draft.projectName).toBeNull();
      expect(s.draft.doDate?.toString()).toBe("2026-09-12");
      expect(screen.getByRole("status")).toHaveTextContent("Added “Email the accountant #taxes” — no project is called “taxes”, so it stays in the title");
    });

    it("a name that fits two projects equally is not guessed: the words stay too", async () => {
      const { user, input, onSubmit } = setup({ projects: withQ4 });
      await user.type(input, "Review copy #acm");
      expect(document.getElementById(input.getAttribute("aria-describedby")!)).toHaveTextContent("acm? → Inbox");
      await user.keyboard("{Enter}");
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ projectId: null, createProjectName: null });
      expect(onSubmit.mock.calls[0][0].draft.title).toBe("Review copy #acm");
      expect(screen.getByRole("status")).toHaveTextContent("#acm fits more than one project, so it stays in the title");
    });

    it("choosing Create still creates, even when a project would fit", async () => {
      const { user, input, onSubmit } = setup({ projects: withQ4 });
      await user.type(input, "Kick-off #Q4");
      await user.click(screen.getByRole("button", { name: /Create “Q4”/ }));
      expect(document.getElementById(input.getAttribute("aria-describedby")!)).toHaveTextContent("new project Q4 → Q4");
      await user.click(screen.getByRole("button", { name: "Add" }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ projectId: null, createProjectName: "Q4" });
      expect(screen.getByRole("status")).toHaveTextContent("Added “Kick-off” to Q4");
    });

    it("a pasted line is filed the same way", async () => {
      const { user, input, onSubmit } = setup({ projects: withQ4 });
      await user.click(input);
      await user.paste("Budget review #Q4\nCall the bank #nowhere");
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      expect(onSubmit.mock.calls.map((c) => [c[0].draft.title, c[0].projectId])).toEqual([
        ["Budget review", "p3"],
        ["Call the bank #nowhere", null],
      ]);
    });
  });

  describe("a multi-line paste (PRODUCT_SPEC.md §5.1 rule 6)", () => {
    it("strips list markers, then offers one Undo that takes back exactly what it added, once", async () => {
      let n = 0;
      const onSubmit = vi.fn<QuickAddSave>().mockImplementation(async () => `task-${++n}`);
      const takeBack = vi.fn<() => Promise<void>>().mockResolvedValue();
      const onPasted = vi.fn((_ids: readonly string[]) => takeBack);
      const { user, input } = setup({ onSubmit, onPasted });
      await user.click(input);
      await user.paste("- Buy milk\n* Call Dana tmr\n[ ] Pay rent\n1. Book the dentist\n");
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("4 tasks added"));
      expect(onSubmit.mock.calls.map((c) => c[0].draft.title)).toEqual(["Buy milk", "Call Dana", "Pay rent", "Book the dentist"]);
      expect(onPasted).toHaveBeenCalledTimes(1);
      expect(onPasted.mock.calls[0][0]).toEqual(["task-1", "task-2", "task-3", "task-4"]);
      await user.click(screen.getByRole("button", { name: "Undo" }));
      expect(takeBack).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Took back 4 tasks"));
      expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    });

    it("a line with no name is skipped and said so; a save that fails stops there, keeps that line, and says what was lost", async () => {
      const onSubmit = vi
        .fn<QuickAddSave>()
        .mockResolvedValueOnce("task-1")
        .mockRejectedValueOnce(new Error("Your account is still loading — try again in a moment."));
      const onPasted = vi.fn(() => vi.fn<() => Promise<void>>().mockResolvedValue());
      const { user, input } = setup({ onSubmit, onPasted });
      await user.click(input);
      await user.paste("Buy milk\ntomorrow ~30m\nCall Dana\nPay rent");
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save “Call Dana”: Your account is still loading — try again in a moment. 1 line after it was not saved either."));
      expect(screen.getByRole("status")).toHaveTextContent("1 task added · 1 line with no name skipped");
      expect(onPasted).toHaveBeenCalledWith(["task-1"]);
      expect(input).toHaveValue("Call Dana");
    });
  });

  it("tokens with no words ask for a name in the strip, and nothing saves (PRODUCT_SPEC.md §5.4)", async () => {
    const { user, input, onSubmit } = setup();
    await user.type(input, "tomorrow ~30m");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)).toHaveTextContent("Give it a name");
    expect(screen.queryByText(/are understood/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.clear(input);
    expect(screen.getByText(/are understood/)).toBeInTheDocument();
  });

  it("Escape with words in the box hands them over to be offered back; an empty box closes quietly (§5.1 rule 4)", async () => {
    const onDiscard = vi.fn();
    const { user, input, onClose } = setup({ onDiscard });
    await user.type(input, "Plan the anniversary dinner fri{Escape}");
    expect(onDiscard).toHaveBeenCalledWith("Plan the anniversary dinner fri", "Plan the anniversary dinner");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.clear(input);
    await user.keyboard("{Escape}");
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("the phone sheet has a 44 px way back (SCREENS.md §22), which discards like Escape", async () => {
    const onDiscard = vi.fn();
    const { user, input, onClose } = setup({ onDiscard });
    const back = within(screen.getByRole("dialog")).getByRole("button", { name: "Close" });
    expect(back.className).toContain("h-11");
    expect(back.parentElement?.className).toContain("sm:hidden");
    await user.type(input, "Call the plumber");
    await user.click(back);
    expect(onDiscard).toHaveBeenCalledWith("Call the plumber", "Call the plumber");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    const { container } = render(<QuickAdd open={false} projects={projects} ctx={ctx} onClose={() => {}} onSubmit={async () => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
