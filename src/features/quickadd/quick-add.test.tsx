// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import { QuickAdd, type QuickAddSubmission } from "./quick-add";

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
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Your account is still loading — try again in a moment."));
    expect(input).toHaveValue("Call Dana");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Added “Call Dana”"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveValue("");
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
    expect(screen.getByText("Website")).toBeInTheDocument();
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

  it("renders nothing when closed", () => {
    const { container } = render(<QuickAdd open={false} projects={projects} ctx={ctx} onClose={() => {}} onSubmit={async () => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
