// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { SpaceId, Task, TaskId } from "@/core/types";

vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => ({}), useQuery: () => ({ data: [] }) }));

import { onOrganize, type OrganizeRequest } from "./organize";
import { RowAction } from "./task-actions";
import { TaskRow } from "./task-row";

const task: Task = {
  id: "t1" as TaskId,
  spaceId: "s1" as SpaceId,
  projectId: null,
  headingId: null,
  title: "Draft the deck",
  notes: null,
  state: "active",
  priority: 0,
  doDate: localDate("2026-10-07"),
  doTime: null,
  deadline: null,
  startDate: null,
  evening: false,
  estimateMin: 30,
  carryCount: 0,
  lastCarriedAt: null,
  lastTouchedAt: instant("2026-10-07T08:00:00Z"),
  missPolicy: "carry",
  recurrenceRule: null,
  recurrenceMode: null,
  recurrenceSeriesId: null,
  recurrencePausedUntil: null,
  sortKey: "a0",
  daySortKey: "a0",
  routineRunId: null,
};

describe("a phone row's ⋯ (SCREENS.md §12, §24)", () => {
  it("offers Move to project…, Add a tag…, Duplicate and Copy link, each asking the organising island", async () => {
    const got: OrganizeRequest[] = [];
    const stop = onOrganize((r) => got.push(r));
    render(
      <ul>
        <TaskRow task={task} actions={<RowAction label="Tomorrow" onClick={() => {}} />} />
      </ul>,
    );
    const user = userEvent.setup();
    for (const name of ["Move to project…", "Add a tag…", "Duplicate", "Copy link"]) {
      await user.click(screen.getByRole("button", { name: "More actions" }));
      await user.click(screen.getByRole("menuitem", { name }));
    }
    expect(got).toEqual([
      { kind: "move", ids: ["t1"] },
      { kind: "tag", ids: ["t1"] },
      { kind: "duplicate", id: "t1" },
      { kind: "copy-link", id: "t1" },
    ]);
    stop();
  });
});
