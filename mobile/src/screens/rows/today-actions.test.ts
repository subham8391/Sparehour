// What Today's rows offer by section, in the web's order, and only what Today hands in.
import type { Task } from "@/core/types";
import { todayRowActions, type TodayRowHandlers } from "./today-actions";

const TASK = { id: "t1", title: "Draft the proposal" } as unknown as Task;
const all = (): Required<TodayRowHandlers> => ({ onToday: jest.fn(), onTomorrow: jest.fn(), onSomeday: jest.fn(), onDrop: jest.fn(), onConvert: jest.fn(), onMoveUp: jest.fn(), onMoveDown: jest.fn(), onBlock: jest.fn() });
const labels = (section: "carried" | "day" | "evening", on: TodayRowHandlers) => todayRowActions(section, TASK, on).map((a) => a.label);

describe("todayRowActions", () => {
  it("a carried-over row: Today, Tomorrow, Someday, Drop, then Convert to project", () => {
    expect(labels("carried", all())).toEqual(["Today", "Tomorrow", "Someday", "Drop", "Convert to project"]);
  });

  it("a row of the day: Move up, Move down, Tomorrow, Block and Convert to project, each only where it is offered", () => {
    const on = all();
    const actions = todayRowActions("day", TASK, on);
    expect(actions.map((a) => a.label)).toEqual(["Move up", "Move down", "Tomorrow", "Block Draft the proposal", "Convert to project"]);
    // Block names its task for a screen reader and shows the one word.
    expect(actions[3].text).toBe("Block");
    actions[3].run();
    expect(on.onBlock).toHaveBeenCalledWith(TASK);
    // A sorted list has no hand order, tomorrow itself has no Tomorrow, a day without hours has nothing to block.
    expect(labels("day", { onConvert: jest.fn() })).toEqual(["Convert to project"]);
  });

  it("an evening row: Convert to project alone", () => {
    expect(labels("evening", all())).toEqual(["Convert to project"]);
  });
});
