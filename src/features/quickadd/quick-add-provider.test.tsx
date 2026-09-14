// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// The provider reads projects, the space and settings from the local database;
// here it gets nothing back, which is enough to exercise the ways in.
vi.mock("@/data/powersync", () => ({
  useQuery: () => ({ data: [], isLoading: false, isFetching: false, error: undefined }),
  useLocalDatabase: () => ({}),
  useSyncStatus: () => ({ connected: false, dataFlowStatus: { uploading: false, downloading: false } }),
}));

import { QuickAddBar, QuickAddFab, QuickAddProvider } from "./quick-add-provider";

function setup() {
  render(
    <QuickAddProvider>
      <label>
        Somewhere else <input aria-label="Other field" />
      </label>
      <QuickAddBar />
      <QuickAddFab />
    </QuickAddProvider>,
  );
  return userEvent.setup();
}

describe("<QuickAddProvider>", () => {
  it("opens on Q with nothing focused", async () => {
    const user = setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("q");
    expect(screen.getByRole("dialog", { name: "Add a task" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Task" })).toHaveValue("");
  });

  it("any printable key opens it and types the character", async () => {
    const user = setup();
    await user.keyboard("D");
    expect(screen.getByRole("textbox", { name: "Task" })).toHaveValue("D");
    expect(screen.getByRole("textbox", { name: "Task" })).toHaveFocus();
  });

  it("leaves other inputs alone", async () => {
    const user = setup();
    await user.click(screen.getByRole("textbox", { name: "Other field" }));
    await user.keyboard("quick");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Other field" })).toHaveValue("quick");
  });

  it("Escape closes it and a second Q opens a fresh one", async () => {
    const user = setup();
    await user.keyboard("q");
    await user.keyboard("Draft");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.keyboard("q");
    expect(screen.getByRole("textbox", { name: "Task" })).toHaveValue("");
  });

  it("the bar and the FAB open it too", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Add a task Q/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Add a task" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
