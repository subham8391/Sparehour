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
    await user.click(screen.getByRole("button", { name: "Acme, edit" }));
    const input = screen.getByRole("textbox", { name: "Project name" });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "Acme renewal{Enter}");
    expect(onSave).toHaveBeenCalledWith("Acme renewal");
    expect(screen.getByRole("button", { name: "Acme, edit" })).toBeInTheDocument();
  });

  it("Escape cancels and an empty name is discarded", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<InlineTitle value="Acme" onSave={onSave} label="Project name" />);
    await user.click(screen.getByRole("button", { name: "Acme, edit" }));
    await user.type(screen.getByRole("textbox"), " renewal{Escape}");
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Acme, edit" }));
    await user.clear(screen.getByRole("textbox"));
    await user.tab();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Acme, edit" })).toHaveTextContent("Acme");
  });

  it("the heading is named by its visible title, not by the edit control's purpose (WCAG 2.5.3)", () => {
    render(<InlineTitle as="h2" value="Budget" onSave={vi.fn()} label="Heading Budget" />);
    const heading = screen.getByRole("heading", { level: 2 });
    // Browsers fold the button's name into the heading's ("Budget, edit"); either way it begins with the title.
    expect(heading).toHaveAccessibleName(/^Budget/);
    expect(heading).not.toHaveAccessibleName(/^Edit/);
    // The text on screen is the title alone, and the control's name begins with it.
    expect(heading).toHaveTextContent(/^Budget$/);
    const button = screen.getByRole("button", { name: "Budget, edit" });
    expect(button).toHaveAccessibleDescription("Edit heading budget");
  });
});
