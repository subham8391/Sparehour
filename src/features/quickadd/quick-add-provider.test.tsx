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

import { QuickAddBar, QuickAddFab, QuickAddProvider, useQuickAdd } from "./quick-add-provider";

function Opener() {
  const { open } = useQuickAdd();
  return (
    <button type="button" onClick={() => open("Prefilled")}>
      open prefilled
    </button>
  );
}

function setup() {
  render(
    <QuickAddProvider>
      <Opener />
      <QuickAddBar />
      <QuickAddFab />
    </QuickAddProvider>,
  );
  return userEvent.setup();
}

describe("<QuickAddProvider>", () => {
  it("opens from the API with a prefill, focused, and Escape closes it", async () => {
    const user = setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "open prefilled" }));
    // The sheet is code-split: the first open waits for its module.
    const input = await screen.findByRole("textbox", { name: "Task" });
    expect(input).toHaveValue("Prefilled");
    expect(input).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("a second open starts fresh", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: "open prefilled" }));
    await screen.findByRole("textbox", { name: "Task" });
    await user.keyboard(" more{Escape}");
    await user.click(screen.getByRole("button", { name: /Add a task Q/ }));
    expect(await screen.findByRole("textbox", { name: "Task" })).toHaveValue("");
  });

  it("the bar and the FAB open it too", async () => {
    const user = setup();
    await user.click(screen.getByRole("button", { name: /Add a task Q/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Add a task" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("nothing of the sheet is mounted before the first open", () => {
    setup();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
