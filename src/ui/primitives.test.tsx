// @vitest-environment jsdom
// The src/ui primitives: roles and names survive the styling, nothing nests
// an interactive element, and axe finds nothing.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { localDate } from "@/core/time";
import { a11yViolations } from "@/test/axe";
import { Button, buttonClass } from "./button";
import { Chip, DeadlineChip } from "./chip";
import { Input } from "./field";
import { Kbd } from "./kbd";
import { EmptyCard, ListCard } from "./list-card";
import { SectionLabel } from "./section-label";
import { Segmented } from "./segmented";

const today = localDate("2026-09-17");

describe("primitives", () => {
  it("render with their roles and names and pass the a11y sweep", async () => {
    const { container } = render(
      <div>
        <SectionLabel count={4} detail="3h" action={<Button variant="link">Clear the slate</Button>}>
          Today
        </SectionLabel>
        <ListCard aria-label="Today">
          <li>
            <Chip tone="block">10:00</Chip>
            <Chip tone="time">14:30</Chip>
            <DeadlineChip deadline={localDate("2026-09-18")} today={today} />
            <DeadlineChip deadline={localDate("2026-10-02")} today={today} />
            <Chip tone="guess">30m?</Chip>
            <Chip tone="spare">done by 16:00</Chip>
          </li>
        </ListCard>
        <EmptyCard fact="That's the day. Nothing is waiting for you." action={<Button variant="link">Pull something in</Button>}>
          That&rsquo;s everything you planned.
        </EmptyCard>
        <Button variant="primary">Add</Button>
        <Button variant="secondary" disabled>
          Block
        </Button>
        <Kbd>Q</Kbd>
        <label>
          Name
          <Input placeholder="A task" />
        </label>
      </div>,
    );
    expect(screen.getByRole("heading", { name: /Today 4 · 3h/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Block" })).toBeDisabled();
    expect(screen.getByText("Tomorrow").className).toContain("text-deadline");
    expect(screen.getByText("2 Oct").className).not.toContain("text-deadline");
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
    expect(await a11yViolations(container)).toEqual([]);
  });

  it("keeps the ink focus ring off inputs that switch their border to ink", () => {
    render(<Input aria-label="Task" />);
    expect(screen.getByRole("textbox", { name: "Task" }).className).toContain("focus-visible:outline-none");
    expect(buttonClass({ variant: "primary" })).not.toContain("outline-none");
  });

  it("is a toggle pair without a label and a radiogroup with one", async () => {
    const onChange = vi.fn();
    const { rerender, container } = render(<Segmented options={[{ value: "list", label: "List" }, { value: "day", label: "Day" }]} value="list" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(onChange).toHaveBeenCalledWith("day");
    rerender(<Segmented label="Theme" options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} value="dark" onChange={onChange} />);
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(await a11yViolations(container)).toEqual([]);
  });
});
