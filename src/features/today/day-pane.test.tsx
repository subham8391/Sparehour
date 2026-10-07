// @vitest-environment jsdom
// The day pane's calendar states: the will-sync marks from the upload queue, and blocking paused with its reason
// (PRODUCT_SPEC.md §10.3 rule 5, SCREENS.md §21).
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { TaskId } from "@/core/types";
import { capacityFixture } from "@/test/fixtures";
import type { TimelineBlock } from "./hooks/use-today";

const h = vi.hoisted(() => ({ pending: [] as { id: string | null }[], create: vi.fn(() => Promise.resolve("new")) }));
vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => ({ data: sql.includes("ps_crud") ? h.pending : [{ id: "u1", personal_space_id: "s1" }] }),
}));
vi.mock("@/features/blocking/use-block-repo", () => ({ useBlockRepo: () => ({ create: h.create, move: vi.fn(), remove: vi.fn(), duplicate: vi.fn(), setLocked: vi.fn(), rename: vi.fn() }) }));
vi.mock("@/features/blocking/blocking-provider", () => ({ useBlocking: () => ({ register: () => () => undefined }) }));

const { DayPane, placerTimeline } = await import("./day-pane");

const blocks: TimelineBlock[] = [
  { id: "b1", taskId: "t1" as TaskId, title: "Draft the proposal", start: 585, end: 630, locked: false, pushState: "synced" },
  { id: "b2", taskId: null, title: "Deep work", start: 780, end: 870, locked: false, pushState: "pending" },
];

function pane(writes?: { on: boolean; off: string | null }) {
  return (
    <DayPane
      start={540}
      end={1080}
      bufferPct={15}
      hint={false}
      writes={writes}
      onOpenTask={() => undefined}
      placing={{ day: localDate("2026-09-14"), zone: "UTC", blocks, free: capacityFixture.free, dayStart: 540, dayEnd: 1080, nowMinute: 570, defaultEstimateMin: 30, findTask: () => undefined }}
      timeline={{ c: capacityFixture, now: instant("2026-09-14T09:30:00Z"), zone: "UTC", blocks }}
    />
  );
}

describe("DayPane", () => {
  it("marks a block whose change waits in the upload queue, and a pending one only when blocks go to Google", () => {
    h.pending = [{ id: "b1" }];
    render(pane({ on: false, off: null }));
    expect(screen.getByRole("button", { name: /^Block: Draft the proposal, .*, will sync$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Block: Deep work, 13:00 to 14:30$/ })).toBeInTheDocument();
  });

  it("with writes on, a block Google has not had yet will sync too", () => {
    h.pending = [];
    render(pane({ on: true, off: null }));
    expect(screen.getByRole("button", { name: /^Block: Deep work, .*, will sync$/ })).toBeInTheDocument();
  });

  it("with blocking paused, says why, marks every block not synced, and takes no drops, drawn blocks or copies", () => {
    h.pending = [];
    const off = "Blocking is paused until Google Calendar is reconnected. Your blocks stay here, not synced.";
    render(pane({ on: false, off }));
    expect(screen.getByRole("note")).toHaveTextContent(off);
    expect(screen.getAllByRole("button", { name: /, not synced$/ })).toHaveLength(2);
    const placer = { repo: {}, placingTask: { title: "x" }, moveBlock: vi.fn(), tapSlot: vi.fn(), placeTask: vi.fn(), createAdHoc: vi.fn(), duplicateBlock: vi.fn() } as never;
    const handlers = placerTimeline(placer, () => undefined, () => undefined, off);
    expect(handlers.onDropTask).toBeUndefined();
    expect(handlers.onCreateBlock).toBeUndefined();
    expect(handlers.onDuplicateBlock).toBeUndefined();
    expect(handlers.onTapSlot).toBeUndefined();
    expect(handlers.placing).toBeNull();
    expect(handlers.onMoveBlock).toBeDefined();
  });
});
