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
    expect(screen.getByRole("button", { name: "Edit project name" })).toBeInTheDocument();
  });
});
