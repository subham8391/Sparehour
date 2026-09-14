// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TaskDraft } from "@/core/quickadd";
import { instant } from "@/core/time";
import { InlineAdd } from "./inline-add";

const ctx = { now: instant("2026-09-11T08:00:00Z"), zone: "Europe/London" };

describe("<InlineAdd>", () => {
  it("parses the line like quick-add, adds on Enter and clears for the next", async () => {
    const onAdd = vi.fn<(d: TaskDraft) => void>();
    const user = userEvent.setup();
    render(
      <ul>
        <InlineAdd ctx={ctx} onAdd={onAdd} />
      </ul>,
    );
    const input = screen.getByRole("textbox", { name: "Add a task" });
    await user.type(input, "Wire up the API ~3h mon{Enter}");
    expect(onAdd).toHaveBeenCalledTimes(1);
    const draft = onAdd.mock.calls[0][0];
    expect(draft.title).toBe("Wire up the API");
    expect(draft.estimateMin).toBe(180);
    expect(draft.doDate?.toString()).toBe("2026-09-14");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("ignores an empty line and Escape clears", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();
    render(
      <ul>
        <InlineAdd ctx={ctx} onAdd={onAdd} />
      </ul>,
    );
    const input = screen.getByRole("textbox", { name: "Add a task" });
    await user.type(input, "   {Enter}");
    expect(onAdd).not.toHaveBeenCalled();
    await user.type(input, "draft{Escape}");
    expect(input).toHaveValue("");
  });
});
