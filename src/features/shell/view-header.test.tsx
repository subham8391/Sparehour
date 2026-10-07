// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/powersync", () => ({
  useSyncStatus: () => ({ connected: true, hasSynced: true, dataFlowStatus: { uploading: false, downloading: false }, anyError: undefined }),
  useQuery: () => ({ data: [], isLoading: false }),
}));

import { PaletteProvider } from "@/features/commands/palette-provider";
import { InlineTitle } from "@/ui/inline-title";
import { ViewHeader } from "./view-header";

const wrap = (ui: React.ReactElement) => render(<PaletteProvider>{ui}</PaletteProvider>);

describe("<ViewHeader>", () => {
  it("makes plain text the view's h1", () => {
    wrap(<ViewHeader eyebrow="Inbox" title="3 to triage" subtitle="A queue to empty." />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("3 to triage");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("an editable title is the heading itself — never an h1 inside an h1", () => {
    wrap(<ViewHeader eyebrow="Project" title={<InlineTitle value="Acme" label="Project name" onSave={vi.fn()} />} />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Acme");
    expect(headings[0].querySelector("h1")).toBeNull();
    // The heading reads as the project's name (WCAG 2.5.3): the edit control adds ", edit" after it.
    expect(headings[0]).toHaveAccessibleName(/^Acme/);
    expect(screen.getByRole("button", { name: "Acme, edit" })).toBeInTheDocument();
  });

  it("with the day arrows beside it the title keeps its longest word, so the actions wrap instead of the title being drawn over them", () => {
    // Today at 1280 px with its day pane: rituals, ⋯ and the arrows took every pixel of the header's auto columns, and
    // "October" lay over "Review carried", taking its clicks (jsdom lays nothing out, so the column rule is what is read).
    wrap(<ViewHeader eyebrow="Today" title="Wednesday 7 October" actions={<button type="button">Review carried</button>} beside={<button type="button">Next day</button>} />);
    const header = screen.getByRole("banner");
    expect(header.className).toContain("sm:grid-cols-[minmax(min-content,1fr)_auto_auto]");
    // Without the arrows the header keeps its two columns.
    wrap(<ViewHeader eyebrow="Inbox" title="3 to triage" actions={<button type="button">Triage all</button>} />);
    expect(screen.getAllByRole("banner")[1].className).not.toContain("min-content");
  });
});
