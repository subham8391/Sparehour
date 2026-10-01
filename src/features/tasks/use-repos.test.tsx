// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { localSqlite } from "@/test/local-sqlite";

const local = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => local.db }));

import { UndoProvider } from "@/features/undo/undo-provider";
import { useHeadingRepo, useProjectRepo } from "./use-repos";

function ProjectMenu() {
  const projects = useProjectRepo();
  const headings = useHeadingRepo();
  return (
    <>
      <button type="button" onClick={() => void projects.setState("p1", "done")}>
        Mark complete
      </button>
      <button type="button" onClick={() => void headings.remove("h1")}>
        Delete heading
      </button>
    </>
  );
}

describe("the repositories a screen builds", () => {
  it("write through the undo stack: the project page's complete and heading delete show a toast that undoes them", async () => {
    const s = localSqlite();
    s.insert("projects", { id: "p1", space_id: "s1", name: "Q4 launch", state: "active" });
    s.insert("headings", { id: "h1", space_id: "s1", project_id: "p1", title: "Budget", sort_key: "a0" });
    local.db = s.db;
    const user = userEvent.setup();
    render(
      <UndoProvider>
        <ProjectMenu />
      </UndoProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Completed project “Q4 launch”");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(s.row("projects", "p1")?.state).toBe("active");

    await user.click(screen.getByRole("button", { name: "Delete heading" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Deleted heading “Budget”");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(s.row("headings", "h1")?.deleted_at).toBeNull();
  });
});
