// @vitest-environment jsdom
// Cmd+. away from Today (SCREENS.md §24 "Toggle the context pane (timeline / detail)"): closes the open task, and
// opens the last one closed again, or else the selected row.
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskDetailProvider, useTaskDetail } from "./task-detail";

vi.mock("@/features/shell/preload-on-idle", () => ({ preloadOnIdle: () => () => {} }));

describe("TaskDetailProvider toggle", () => {
  it("closes, reopens the last task, and falls back to the selected row when nothing was open", () => {
    const api: { current: ReturnType<typeof useTaskDetail> | null } = { current: null };
    function Peek() {
      api.current = useTaskDetail();
      return null;
    }
    render(
      <TaskDetailProvider>
        <Peek />
      </TaskDetailProvider>,
    );
    act(() => api.current!.toggle(null));
    expect(api.current!.selectedId).toBeNull();
    act(() => api.current!.toggle("selected"));
    expect(api.current!.selectedId).toBe("selected");
    act(() => api.current!.open("t1"));
    act(() => api.current!.toggle("selected"));
    expect(api.current!.selectedId).toBeNull();
    act(() => api.current!.toggle("selected"));
    expect(api.current!.selectedId).toBe("t1");
  });
});
