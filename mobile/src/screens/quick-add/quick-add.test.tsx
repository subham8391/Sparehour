// Quick add as the app mounts it: nothing of the sheet until it is first asked for, the day, project, heading or area
// it is opened on reaching the save, a new project made on the way, and a discard offered back through the app's undo.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { localDate } from "@/core/time";
import { UndoContext, type UndoApi } from "@/features/undo/undo-context";
import type { UndoEntry } from "@/features/undo/undo-stack";
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
jest.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => ({ create: mockCreate }) }));
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
const save = async (line: string) => {
  await fireEvent.changeText(box(), line);
  await act(async () => {
    await fireEvent(box(), "submitEditing");
  });
};
const created = (call = 0) => mockCreate.mock.calls[call] as [{ title: string; doDate: { toString(): string } | null; tagNames: string[] }, Record<string, unknown>];

beforeEach(() => {
  jest.clearAllMocks();
  recorded.length = 0;
});

describe("<QuickAddProvider>", () => {
  it("mounts nothing of the sheet until it is asked for, then opens it empty", async () => {
    await setup();
    expect(screen.queryByLabelText("Task")).toBeNull();
    await open();
    expect(box().props.value).toBe("");
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
    expect(box().props.value).toBe("");
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
    expect(box().props.value).toBe("Pricing review");
    await open();
    expect(box().props.value).toBe("");
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
    expect(box().props.value).toBe("Call the bank ~15m");
    expect(screen.getByText("Tue 24 Nov")).toBeTruthy();
  });

  it("an empty box closes quietly: nothing to undo", async () => {
    await setup();
    await open();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(recorded).toHaveLength(0);
  });
});
