// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { convertedProjectHref, useConvertToProject } from "./use-convert";

const router = { push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("useConvertToProject", () => {
  it("opens the new project in its add row, and an undo while it is still open steps back from it", async () => {
    let undone: ((projectId: string) => void) | undefined;
    const repo = {
      convertToProject: vi.fn(async (_id: string, onUndone?: (projectId: string) => void) => {
        undone = onUndone;
        return { projectId: "p 1", taskIds: [] };
      }),
    };
    const onDone = vi.fn();
    const { result } = renderHook(() => useConvertToProject(repo, onDone));
    await act(async () => expect(await result.current("t1")).toBe(true));
    expect(onDone).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith("/project/p%201?add=1");
    expect(convertedProjectHref("p 1")).toBe("/project/p%201?add=1");

    // Undone somewhere else: nothing moves.
    undone?.("p 1");
    expect(router.back).not.toHaveBeenCalled();
    // Undone with the removed project on screen: back to where the conversion was made.
    window.history.pushState({}, "", "/project/p%201?add=1");
    undone?.("p 1");
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("does nothing more when the task could not be converted", async () => {
    router.push.mockClear();
    const onDone = vi.fn();
    const { result } = renderHook(() => useConvertToProject({ convertToProject: vi.fn(async () => null) }, onDone));
    await act(async () => expect(await result.current("t1")).toBe(false));
    expect(onDone).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
