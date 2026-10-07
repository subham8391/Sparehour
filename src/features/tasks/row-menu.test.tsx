// @vitest-environment jsdom
// The row ⋯ menu (SCREENS.md §24, PRODUCT_SPEC.md §8.6, SCREENS.md §3): it
// holds the row's actions, then This evening · Tomorrow · In 4 hours · This
// weekend · Next week, each the palette's own write, and Move to…, the day
// picker that puts the task at the end of the chosen day. `.` opens the
// selected row's menu, the palette's Move to… its picker.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Temporal, localDate } from "@/core/time";
import { RUNS, type CommandContext } from "@/features/commands/command-runs";
import { taskFixture } from "@/test/fixtures";
import { moveToDay, pickerDayName, pickerDays } from "./day-picker";
import { requestRow } from "./row-request";
import { snoozePresets } from "./snooze";
import { MoveActions, MoveToAction } from "./task-actions";
import { TaskList, TaskRow } from "./task-row";
import { CompactRow } from "@/features/upcoming/compact-row";

const repo = { update: vi.fn(async () => {}), updateMany: vi.fn(async () => {}), placeInDay: vi.fn<(id: string, day: unknown, key: string, evening: boolean) => Promise<void>>(async () => {}), series: async () => ({ skip: vi.fn() }) };
vi.mock("./use-task-repo", () => ({ useTaskRepo: () => repo }));
const db = { getOptional: vi.fn<(sql: string, args?: unknown[]) => Promise<unknown>>(async () => null) };
vi.mock("@/data/powersync", () => ({ useLocalDatabase: () => db, useQuery: () => ({ data: undefined }) }));

beforeEach(() => {
  repo.update.mockClear();
  repo.updateMany.mockClear();
  repo.placeInDay.mockClear();
  db.getOptional.mockReset();
});

const open = taskFixture("t1", "Draft the proposal", { doDate: localDate("2026-09-14") });

function Row({ selected = false, actions }: { selected?: boolean; actions?: React.ReactNode }) {
  return (
    <TaskList>
      <TaskRow task={open} onOpen={() => {}} selected={selected} actions={actions ?? <MoveActions onToday={() => {}} onTomorrow={() => {}} onSomeday={() => {}} />} />
    </TaskList>
  );
}

const menuWords = () => within(screen.getByRole("menu")).queryAllByRole("menuitem").map((b) => b.textContent);

describe("the row ⋯ menu", () => {
  it("from `sm` up the hover zone ends in the ⋯, which holds every row action and then the presets and Move to…", async () => {
    const user = userEvent.setup();
    render(<Row />);
    const trigger = screen.getByRole("button", { name: "More actions" });
    // The ⋯ sits in the action zone with the inline actions (one element, revealed together).
    expect(trigger.closest("[role=row]")?.querySelector(".sm\\:absolute")?.contains(trigger)).toBe(true);
    await user.click(trigger);
    await waitFor(() => expect(menuWords()).toEqual(["Today", "Someday", "Move to project…", "Add a tag…", "Duplicate", "Copy link", "This evening", "Tomorrow", "In 4 hours", "This weekend", "Next week", "Move to…"]));
    // The row's own "Tomorrow" stepped aside for the preset: it is listed once.
    expect(screen.getAllByRole("menuitem", { name: "Tomorrow" })).toHaveLength(1);
    expect(within(screen.getByRole("menu")).getByRole("separator")).toBeInTheDocument();
  });

  it("each preset writes the palette's patch for the same preset, with its undo note", async () => {
    const user = userEvent.setup();
    render(<Row />);
    const ids = ["evening", "tomorrow", "in4h", "weekend", "nextweek"] as const;
    const labels = ["This evening", "Tomorrow", "In 4 hours", "This weekend", "Next week"];
    const fromMenu: unknown[] = [];
    for (const label of labels) {
      await user.click(screen.getByRole("button", { name: "More actions" }));
      await user.click(await screen.findByRole("menuitem", { name: label }));
      fromMenu.push(repo.update.mock.calls.at(-1));
    }
    repo.update.mockClear();
    // The palette, run on the same task at the same moment (the device's zone and day: no settings row here).
    const now = Temporal.Now.instant();
    const ctx = { selectedTaskId: "t1", checkedTaskIds: [], now, zone: "UTC", today: Temporal.Now.plainDateISO("UTC"), tasks: repo } as unknown as CommandContext;
    for (const id of ids) await RUNS.find((r) => r.id === `task.${id}`)!.run(ctx);
    const fromPalette = repo.update.mock.calls;
    expect(fromMenu).toHaveLength(5);
    // "In 4 hours" depends on the minute; the others must match exactly, and its note and date shape too.
    fromMenu.forEach((call, i) => {
      const [id, patch, note] = call as [string, { doDate: unknown; doTime: unknown; evening: boolean }, string];
      const [pid, ppatch, pnote] = fromPalette[i] as unknown as [string, typeof patch, string];
      expect(id).toBe(pid);
      expect(note).toBe(pnote);
      if (ids[i] !== "in4h") expect(patch).toEqual(ppatch);
      else expect(patch.evening).toBe(false);
    });
    expect(fromMenu[0]).toEqual(["t1", snoozePresets(now, "UTC", Temporal.Now.plainDateISO("UTC"))[0].patch, "Moved {title} to this evening"]);
  });

  it("a finished task's menu has no presets and no Move to…", async () => {
    const user = userEvent.setup();
    render(
      <TaskList>
        <TaskRow task={{ ...open, state: "done" }} actions={<MoveActions onToday={() => {}} />} />
      </TaskList>,
    );
    await user.click(screen.getByRole("button", { name: "More actions" }));
    // Organising stays: a finished task can still be duplicated or linked, not moved or tagged.
    expect(menuWords()).toEqual(["Today", "Duplicate", "Copy link"]);
  });

  it("`.` on the selected row opens its menu with focus on the first item; Escape hands focus back to the row's ⋯", async () => {
    const user = userEvent.setup();
    render(<Row selected />);
    act(() => void requestRow("t1", "menu"));
    expect(screen.getByRole("menu", { name: "More actions" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Today" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "More actions" })).toHaveFocus();
  });

  it("a row that is not selected does not answer, so the command falls back to the task", () => {
    render(<Row />);
    const openTask = vi.fn();
    const ctx = { selectedTaskId: "t1", checkedTaskIds: [], openTask } as unknown as CommandContext;
    RUNS.find((r) => r.id === "task.menu")!.run(ctx);
    expect(openTask).toHaveBeenCalledWith("t1");
    RUNS.find((r) => r.id === "task.move-day")!.run(ctx);
    expect(openTask).toHaveBeenLastCalledWith("t1", "do");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Move to…", () => {
  it("opens the day picker: the next seven days and a date field; a day moves the task to the end of that day", async () => {
    const user = userEvent.setup();
    render(<Row />);
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Move to…" }));
    const picker = await screen.findByRole("dialog", { name: "Move to…" });
    const days = within(picker).getAllByRole("listitem");
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveTextContent(/^Today/);
    expect(days[1]).toHaveTextContent(/^Tomorrow/);
    expect(within(picker).getByLabelText("Pick a date for Draft the proposal")).toHaveAttribute("type", "date");
    // The task moves to the end of the chosen day, in its part of the day.
    db.getOptional.mockImplementation(async (sql: string) => (sql.includes("max(day_sort_key)") ? { k: "a3" } : { do_date: "2026-09-14", evening: 0 }));
    await user.click(within(days[1]).getByRole("button"));
    expect(screen.queryByRole("dialog", { name: "Move to…" })).toBeNull();
    const tomorrow = Temporal.Now.plainDateISO("UTC").add({ days: 1 });
    await waitFor(() => expect(repo.placeInDay).toHaveBeenCalledWith("t1", tomorrow, expect.any(String), false));
    expect(repo.placeInDay.mock.calls[0][2] > "a3").toBe(true);
    // Focus goes back to the row's ⋯.
    await waitFor(() => expect(screen.getByRole("button", { name: "More actions" })).toHaveFocus());
  });

  it("the palette's Move to… opens the selected row's picker", async () => {
    render(<Row selected />);
    let answered = false;
    act(() => {
      answered = requestRow("t1", "move");
    });
    expect(answered).toBe(true);
    expect(await screen.findByRole("dialog", { name: "Move to…" })).toBeInTheDocument();
  });

  it("an inline action can open the same picker under its own name (Someday's Pick a date)", async () => {
    const user = userEvent.setup();
    render(<Row actions={<MoveToAction label="Pick a date" text={null} />} />);
    await user.click(screen.getByRole("button", { name: "Pick a date" }));
    const picker = await screen.findByRole("dialog", { name: "Pick a date" });
    db.getOptional.mockImplementation(async (sql: string) => (sql.includes("max(day_sort_key)") ? { k: null } : { do_date: null, evening: 0 }));
    fireEvent.change(within(picker).getByLabelText("Pick a date for Draft the proposal"), { target: { value: "2030-01-15" } });
    await waitFor(() => expect(repo.placeInDay).toHaveBeenCalledWith("t1", localDate("2030-01-15"), expect.any(String), false));
    expect(screen.queryByRole("dialog", { name: "Pick a date" })).toBeNull();
  });
});

describe("a week column's compact row (no ⋯ of its own)", () => {
  it("answers the palette's Move to… with the day picker beside its title; `.` is left to open the task", async () => {
    render(
      <ul>
        <CompactRow task={open} today={localDate("2026-09-14")} selected onOpen={() => {}} />
      </ul>,
    );
    expect(requestRow("t1", "menu")).toBe(false);
    let answered = false;
    act(() => {
      answered = requestRow("t1", "move");
    });
    expect(answered).toBe(true);
    const picker = await screen.findByRole("dialog", { name: "Move to…" });
    expect(within(picker).getAllByRole("listitem")).toHaveLength(7);
    db.getOptional.mockImplementation(async (sql: string) => (sql.includes("max(day_sort_key)") ? { k: null } : { do_date: "2026-09-14", evening: 0 }));
    await userEvent.setup().click(within(picker).getAllByRole("button")[1]);
    await waitFor(() => expect(repo.placeInDay).toHaveBeenCalledWith("t1", expect.anything(), expect.any(String), false));
    expect(screen.queryByRole("dialog", { name: "Move to…" })).toBeNull();
  });

  it("a done task in a column does not answer", () => {
    render(
      <ul>
        <CompactRow task={{ ...open, state: "done" }} today={localDate("2026-09-14")} selected onOpen={() => {}} />
      </ul>,
    );
    expect(requestRow("t1", "move")).toBe(false);
  });
});

describe("moveToDay", () => {
  it("keeps the evening, lands after the day's last task, and leaves a task already on that day alone", async () => {
    const placeInDay = vi.fn(async () => {});
    const day = localDate("2026-09-17");
    const get = vi.fn(async (sql: string, args: unknown[]): Promise<unknown> => (sql.includes("max(day_sort_key)") ? { k: args[1] === 1 ? "a9" : "a1" } : { do_date: "2026-09-14", evening: 1 }));
    await moveToDay({ getOptional: get } as never, { placeInDay }, "t1", day);
    expect(placeInDay).toHaveBeenCalledWith("t1", day, expect.any(String), true);
    expect(String((placeInDay.mock.calls[0] as unknown[])[2]) > "a9").toBe(true);
    placeInDay.mockClear();
    await moveToDay({ getOptional: async () => ({ do_date: "2026-09-17", evening: 0 }) } as never, { placeInDay }, "t1", day);
    expect(placeInDay).not.toHaveBeenCalled();
  });

  it("names the days Today, Tomorrow, then by weekday and date", () => {
    const today = localDate("2026-09-14");
    expect(pickerDays(today).map((d) => pickerDayName(d, today))).toEqual(["Today", "Tomorrow", "Wed 16", "Thu 17", "Fri 18", "Sat 19", "Sun 20"]);
  });
});
