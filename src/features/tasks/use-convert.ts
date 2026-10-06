"use client";
// Convert task → project from any surface (the detail's ⋯ and checklist ⋯, a
// row's ⋯, the palette, "Break it down" in the three-carry ask and the long
// hint): one write through the task repository, whose conversion module is
// loaded on this click, then the new project opens with the cursor in its
// first empty task row (PRODUCT_SPEC.md §8.3.5).
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import type { TaskRepo } from "@/data/repositories/task-repo";

/** Where a converted task's project opens: `?add=1` puts the cursor in its add row. */
export const convertedProjectHref = (projectId: string): string => `/project/${encodeURIComponent(projectId)}?add=1`;

/** Converts the task and opens the project; resolves false when the task could not be converted. */
export function useConvertToProject(repo: Pick<TaskRepo, "convertToProject">, onDone?: () => void): (taskId: string) => Promise<boolean> {
  const router = useRouter();
  return useCallback(
    async (taskId: string) => {
      const out = await repo.convertToProject(taskId);
      if (!out) return false;
      onDone?.();
      router.push(convertedProjectHref(out.projectId));
      return true;
    },
    [repo, router, onDone],
  );
}
