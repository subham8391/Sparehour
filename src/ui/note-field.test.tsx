// @vitest-environment jsdom
// Notes are rendered at rest and edited in place (SCREENS.md §9–§10): a click
// or Enter opens the editor, blur or Escape saves and draws the note again, a
// link opens in a new tab without starting an edit, and an empty note is the
// editor with its placeholder.
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { NoteField } from "./note-field";

function Harness({ initial, onSave }: { initial: string | null; onSave: (v: string | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NoteField
        value={value}
        label="Notes"
        placeholder="Anything worth remembering."
        onSave={(v) => {
          onSave(v);
          setValue(v);
        }}
      />
      <button type="button">elsewhere</button>
    </>
  );
}

const setup = (initial: string | null) => {
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(<Harness initial={initial} onSave={onSave} />);
  return { user, onSave };
};

describe("NoteField", () => {
  it("an empty note is the editor, with its placeholder", async () => {
    const { user, onSave } = setup(null);
    const editor = screen.getByRole("textbox", { name: "Notes" });
    expect(editor).toHaveAttribute("placeholder", "Anything worth remembering.");
    await user.click(editor);
    await user.type(editor, "**Call** Dana");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(onSave).toHaveBeenCalledWith("**Call** Dana");
    // Saved, the note is drawn as Markdown.
    expect(await screen.findByText("Call", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Notes" })).toBeNull();
  });

  it("a click on the rendered note opens the editor in place; Escape saves and draws it again", async () => {
    const { user, onSave } = setup("First line\n\n- [ ] a box");
    const note = await screen.findByRole("group", { name: "Notes" });
    await screen.findByText("a box");
    await user.click(screen.getByText("First line"));
    const editor = screen.getByRole("textbox", { name: "Notes" });
    expect(editor).toHaveFocus();
    expect(editor).toHaveValue("First line\n\n- [ ] a box");
    await user.type(editor, "\nmore");
    await user.keyboard("{Escape}");
    expect(onSave).toHaveBeenCalledWith("First line\n\n- [ ] a box\nmore");
    expect(await screen.findByRole("group", { name: "Notes" })).toHaveFocus();
    expect(note).not.toBeInTheDocument();
  });

  it("Enter on the focused note opens the editor, and Escape does not reach the panel", async () => {
    const { user, onSave } = setup("Keep this");
    const onWindowKey = vi.fn();
    window.addEventListener("keydown", onWindowKey);
    const note = await screen.findByRole("group", { name: "Notes" });
    act(() => note.focus());
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(onWindowKey.mock.calls.some(([e]) => (e as KeyboardEvent).key === "Escape")).toBe(false);
    window.removeEventListener("keydown", onWindowKey);
    // Nothing changed, so nothing is written.
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a link opens in a new tab without starting an edit", async () => {
    const { user } = setup("See [the brief](https://example.com/brief)");
    const link = await screen.findByRole("link", { name: "the brief" });
    expect(link).toHaveAttribute("target", "_blank");
    link.addEventListener("click", (e) => e.preventDefault());
    await user.click(link);
    expect(screen.queryByRole("textbox", { name: "Notes" })).toBeNull();
  });

  it("clearing the words saves an empty note as null", async () => {
    const { user, onSave } = setup("Old");
    await user.click(await screen.findByText("Old"));
    await user.clear(screen.getByRole("textbox", { name: "Notes" }));
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(onSave).toHaveBeenCalledWith(null);
  });
});
