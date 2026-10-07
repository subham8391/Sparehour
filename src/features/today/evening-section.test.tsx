// @vitest-environment jsdom
// This Evening (SCREENS.md §2.5, §2.8): its readout, "That's a full evening.", the phone's collapsed start that is
// remembered, and the place to drop a row while This Evening is empty.
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localTime } from "@/core/time";
import { EveningSection, type EveningSectionProps } from "./evening-section";

const rows = (
  <ul>
    <li>Call Mum</li>
    <li>Read a chapter</li>
  </ul>
);

function props(over: Partial<EveningSectionProps> = {}): EveningSectionProps {
  return {
    count: 2,
    plannedMin: 50,
    // A 09:00–18:00 day and the default cut-off: four hours of evening.
    windows: [{ start: 540, end: 1080 }],
    eveningStartsAt: localTime("18:00"),
    eveningEndsAt: localTime("22:00"),
    rows,
    onDrop: null,
    onShutChange: vi.fn(),
    ...over,
  };
}

function phone(matches: boolean) {
  const query = { matches, media: "", onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false };
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: () => query });
}

afterEach(() => {
  Reflect.deleteProperty(window, "matchMedia");
  localStorage.clear();
});

describe("<EveningSection>", () => {
  it("heads its rows with THIS EVENING · count · minutes, and says nothing more while the evening has room", () => {
    render(<EveningSection {...props()} />);
    expect(screen.getByRole("heading", { name: /This evening/ })).toHaveTextContent("This evening2 · 50m");
    expect(screen.getByText("Call Mum")).toBeVisible();
    expect(screen.queryByText(/full evening/)).not.toBeInTheDocument();
  });

  it("past its budget says so in one quiet line, never in the over colour", () => {
    render(<EveningSection {...props({ plannedMin: 4 * 60 + 5 })} />);
    const line = screen.getByText("That’s a full evening.");
    expect(line).toHaveClass("text-ink-2");
    expect(line.className).not.toMatch(/over/);
    // The header readout stays as it was.
    expect(screen.getByRole("heading", { name: /This evening/ })).toHaveTextContent("2 · 4h 05m");
  });

  it("measures the evening from the end of the working day to the cut-off", () => {
    // Work until 21:00 and a 22:00 cut-off: an hour, so 50 minutes still fits and 70 does not.
    const late = [{ start: 720, end: 1260 }];
    const { rerender } = render(<EveningSection {...props({ windows: late })} />);
    expect(screen.queryByText(/full evening/)).not.toBeInTheDocument();
    rerender(<EveningSection {...props({ windows: late, plannedMin: 70 })} />);
    expect(screen.getByText("That’s a full evening.")).toBeInTheDocument();
  });

  it("on a phone starts collapsed to a 44 px summary with its count and minutes, and tells Today its rows are hidden", () => {
    phone(true);
    const p = props({ plannedMin: 300 });
    const { container } = render(<EveningSection {...p} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const summary = container.querySelector("summary") as HTMLElement;
    expect(summary).toHaveTextContent("This evening2 · 5h");
    expect(summary).toHaveClass("min-h-11");
    // The full line stays in view while the rows are folded away.
    expect(screen.getByText("That’s a full evening.")).toBeInTheDocument();
    expect(p.onShutChange).toHaveBeenLastCalledWith(true);
  });

  it("on a phone remembers being opened, and opens that way next time", () => {
    phone(true);
    const p = props();
    const { container, unmount } = render(<EveningSection {...p} />);
    const details = container.querySelector("details") as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(p.onShutChange).toHaveBeenLastCalledWith(false);
    expect(localStorage.getItem("sparehour:evening-open")).toBe("1");
    unmount();
    const again = render(<EveningSection {...props()} />);
    expect((again.container.querySelector("details") as HTMLDetailsElement).open).toBe(true);
  });

  it("while a row is dragged over an empty evening, shows where to drop it", () => {
    render(<EveningSection {...props({ count: 0, plannedMin: 0, rows: null, onDrop: vi.fn() })} />);
    expect(screen.getByRole("heading", { name: "This evening" })).toBeInTheDocument();
    expect(screen.getByTestId("section-drop")).toHaveTextContent("Drop here for this evening");
  });
});
