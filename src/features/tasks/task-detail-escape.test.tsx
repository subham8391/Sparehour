// @vitest-environment jsdom
// Escape closes the open task (SCREENS.md §1 rule 3) from the moment it opens. The surface is an island
// (task-detail-surface.tsx) that can still be arriving when a person clicks a title and presses Escape at once
// (e2e: a row selected by a click, then Escape, then B); that Escape used to be lost and the task opened anyway.
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskDetailPane, TaskDetailProvider, useTaskDetail } from "./task-detail";

vi.mock("@/features/shell/preload-on-idle", () => ({ preloadOnIdle: () => () => {} }));
// The island has not arrived: nothing of the surface is drawn, and none of its listeners are there.
vi.mock("next/dynamic", () => ({ default: () => () => null }));

describe("<TaskDetailPane>", () => {
  it("closes on Escape while its surface is still arriving", () => {
    const api: { current: ReturnType<typeof useTaskDetail> | null } = { current: null };
    function Peek() {
      api.current = useTaskDetail();
      return null;
    }
    render(
      <TaskDetailProvider>
        <Peek />
        <TaskDetailPane />
      </TaskDetailProvider>,
    );
    act(() => api.current!.open("t1"));
    expect(api.current!.selectedId).toBe("t1");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.current!.selectedId).toBeNull();
    // Any other key leaves it open.
    act(() => api.current!.open("t2"));
    fireEvent.keyDown(window, { key: "x" });
    expect(api.current!.selectedId).toBe("t2");
  });
});
