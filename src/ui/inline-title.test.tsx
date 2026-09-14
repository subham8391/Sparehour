// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InlineTitle } from "./inline-title";

describe("<InlineTitle>", () => {
  it("edits in place and saves on Enter", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineTitle value="Acme" onSave={onSave} label="Project name" />);
    await user.click(screen.getByRole("button", { name: "Edit project name" }));
    const input = screen.getByRole("textbox", { name: "Project name" });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "Acme renewal{Enter}");
    expect(onSave).toHaveBeenCalledWith("Acme renewal");
    expect(screen.getByRole("button", { name: "Edit project name" })).toBeInTheDocument();
  });

  it("Escape cancels and an empty name is discarded", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineTitle value="Acme" onSave={onSave} label="Project name" />);
    await user.click(screen.getByRole("button", { name: "Edit project name" }));
    await user.type(screen.getByRole("textbox"), " renewal{Escape}");
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Edit project name" }));
    await user.clear(screen.getByRole("textbox"));
    await user.tab();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit project name" })).toHaveTextContent("Acme");
  });
});
