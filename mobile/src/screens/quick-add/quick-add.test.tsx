// Quick add as the app mounts it: nothing of the sheet until it is first asked for, the day, project, heading or area
// it is opened on reaching the save, a new project made on the way, and a discard offered back through the app's undo.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { localDate } from "@/core/time";
import { UndoContext, type UndoApi } from "@/features/undo/undo-context";
import type { UndoEntry } from "@/features/undo/undo-stack";
import { askForQuickAdd, takeQuickAddAsk } from "./ask";
import { wordsIn } from "./box-words";
import { QuickAddProvider, useQuickAdd, type AddHere } from "./quick-add";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("chrono-node/en", () => jest.requireActual("../../../node_modules/chrono-node/dist/cjs/locales/en/index.js"), { virtual: true });
jest.mock("~/api", () => ({ apiFetch: jest.fn() }));

const mockDb = { getOptional: jest.fn(async () => null) };
const mockCreate = jest.fn(async (..._args: unknown[]) => "new-task");
const mockMakeProject = jest.fn(async (..._args: unknown[]) => "new-project");
jest.mock("@/data/powersync", () => ({
  useLocalDatabase: () => mockDb,
  useQuery: (sql: string) => ({
    data: sql.includes("personal_space_id") ? [{ personal_space_id: "s1" }] : sql.includes("from projects") ? [{ id: "p1", name: "Acme launch", area_id: "a1" }] : sql.includes("from areas") ? [{ id: "a1", name: "Work" }] : sql.includes("from tags") ? [{ id: "g1", name: "calls" }] : [],
  }),
}));
jest.mock("@/data/repositories/project-repo", () => ({
  ProjectRepo: class {
    create(...args: unknown[]) {
      return mockMakeProject(...args);
    }
  },
}));
const mockRemoveCreated = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => ({ create: mockCreate, removeCreated: mockRemoveCreated }) }));
jest.mock("@/features/estimates/use-learned", () => ({ useLearned: () => null }));
jest.mock("@/features/quickadd/use-day-effect", () => ({ useDayEffect: () => ({ text: "Leaves 2h 50m spare today", over: false }) }));
jest.mock("@/features/shell/use-local-day", () => {
  const time = jest.requireActual("@/core/time") as typeof import("@/core/time");
  return { useNow: () => time.Temporal.Instant.from("2026-11-21T10:00:00Z"), useLocalDay: () => ({ today: time.localDate("2026-11-21"), zone: "UTC", settings: { defaultEstimateMin: 30 }, ready: true }) };
});

let quickAdd: ReturnType<typeof useQuickAdd>;
function Opener() {
  quickAdd = useQuickAdd();
  return <Text>the screen</Text>;
}
const recorded: UndoEntry[] = [];
const undo = { record: (entry: UndoEntry) => recorded.push(entry), undo: async () => false, redo: async () => false, canUndo: false, canRedo: false } as unknown as UndoApi;
const setup = () =>
  render(
    <UndoContext.Provider value={undo}>
      <QuickAddProvider>
        <Opener />
      </QuickAddProvider>
    </UndoContext.Provider>,
  );
const open = (here?: AddHere) => act(async () => quickAdd.open(here));
const box = () => screen.getByLabelText("Task");
/** The words in the box, every space kept. */
const said = () => wordsIn(box());
const save = async (line: string) => {
  await fireEvent.changeText(box(), line);
  await act(async () => {
    await fireEvent(box(), "submitEditing");
  });
};
const created = (call = 0) => mockCreate.mock.calls[call] as [{ title: string; doDate: { toString(): string } | null; tagNames: string[] }, Record<string, unknown>];

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockImplementation(async () => "new-task");
  recorded.length = 0;
});

describe("<QuickAddProvider>", () => {
  it("mounts nothing of the sheet until it is asked for, then opens it empty", async () => {
    await setup();
    expect(screen.queryByLabelText("Task")).toBeNull();
    await open();
    expect(said()).toBe("");
    expect(screen.getByRole("header", { name: "Quick add" })).toBeTruthy();
  });

  it("a plain line is saved in the person's space, nowhere in particular, with its tags by name", async () => {
    await setup();
    await open();
    await save("Call the bank @calls");
    expect(created()[0]).toMatchObject({ title: "Call the bank", doDate: null, tagNames: ["calls"] });
    expect(created()[1]).toEqual({ spaceId: "s1", projectId: null, headingId: null, areaId: null });
    expect(screen.getByText("Added “Call the bank”")).toBeTruthy();
  });

  it("opened on a day, the day is beside the line and the task is saved on it, with what it does to the day said first", async () => {
    await setup();
    await open({ day: localDate("2026-11-21") });
    expect(said()).toBe("");
    expect(screen.getByRole("button", { name: "Remove “Today”" })).toBeTruthy();
    await fireEvent.changeText(box(), "Write the report ~30m");
    expect(screen.getByText("Leaves 2h 50m spare today")).toBeTruthy();
    await save("Write the report ~30m");
    expect(created()[0].doDate?.toString()).toBe("2026-11-21");
  });

  it("opened under a heading of a project, the task goes into that project under that heading", async () => {
    await setup();
    await open({ projectId: "p1", headingId: "h1" });
    await save("Write the brief");
    expect(created()[1]).toEqual({ spaceId: "s1", projectId: "p1", headingId: "h1", areaId: null });
  });

  it("opened on an area's page, a line with no project is filed in the area", async () => {
    await setup();
    await open({ areaId: "a1" });
    expect(screen.getByLabelText("Goes to Work")).toBeTruthy();
    await save("Renew the insurance");
    expect(created()[1]).toEqual({ spaceId: "s1", projectId: null, headingId: null, areaId: "a1" });
  });

  it("a line that asks for a new project has it made, and the task filed in it", async () => {
    await setup();
    await open();
    await save("Book the venue #+offsite");
    expect(mockMakeProject).toHaveBeenCalledWith("offsite", { spaceId: "s1" });
    expect(created()[1]).toMatchObject({ projectId: "new-project" });
    expect(screen.getByText("Added “Book the venue” to offsite")).toBeTruthy();
  });

  it("opens holding the words it is handed, and each open starts fresh", async () => {
    await setup();
    await open({ text: "Pricing review" });
    expect(said()).toBe("Pricing review");
    await open();
    expect(said()).toBe("");
  });

  it("closing with words in the box records one undo, which reopens the sheet holding them in the same place", async () => {
    await setup();
    await open({ day: localDate("2026-11-24") });
    await fireEvent.changeText(box(), "Call the bank ~15m");
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ label: "Discarded “Call the bank”", toast: true });
    await act(async () => {
      await recorded[0].undo();
    });
    expect(said()).toBe("Call the bank ~15m");
    expect(screen.getByText("Tue 24 Nov")).toBeTruthy();
  });

  it("a pasted list is one undo entry for all its tasks: the sheet's Undo and the toast's run the same take-back, once", async () => {
    let n = 0;
    mockCreate.mockImplementation(async () => `task-${++n}`);
    await setup();
    await open();
    await act(async () => {
      await fireEvent.changeText(box(), "- Buy milk\n- Call Dana\n- Pay rent");
    });
    expect(mockCreate.mock.calls.map((c) => (c[0] as { title: string }).title)).toEqual(["Buy milk", "Call Dana", "Pay rent"]);
    expect(screen.getByText("3 tasks added")).toBeTruthy();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ label: "3 tasks added", toast: true, rows: { tasks: ["task-1", "task-2", "task-3"] } });
    await act(async () => {
      await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
    });
    expect(mockRemoveCreated).toHaveBeenCalledTimes(1);
    expect(mockRemoveCreated).toHaveBeenCalledWith(["task-1", "task-2", "task-3"]);
    expect(screen.getByText("Took back 3 tasks")).toBeTruthy();
    // The toast's Undo after the sheet's: the same take-back, already run.
    await act(async () => {
      await recorded[0].undo();
    });
    expect(mockRemoveCreated).toHaveBeenCalledTimes(1);
  });

  describe("asked for from outside the app's screens (ask.ts)", () => {
    it("the icon's Add a task shortcut opens the sheet empty, once", async () => {
      askForQuickAdd();
      await setup();
      expect(said()).toBe("");
      expect(screen.getByRole("header", { name: "Quick add" })).toBeTruthy();
      expect(takeQuickAddAsk()).toBeNull();
    });

    it("what another app shared opens the sheet holding it, also when the app is already open", async () => {
      await setup();
      expect(screen.queryByLabelText("Task")).toBeNull();
      await act(async () => askForQuickAdd({ text: "Read the report // https://example.com/report" }));
      expect(said()).toBe("Read the report // https://example.com/report");
      expect(screen.getByRole("button", { name: "Remove “with a note”" })).toBeTruthy();
      await save("Read the report // https://example.com/report");
      expect(created()[0]).toMatchObject({ title: "Read the report", notes: "https://example.com/report" });
    });
  });

  it("an empty box closes quietly: nothing to undo", async () => {
    await setup();
    await open();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(recorded).toHaveLength(0);
  });
});
