// What Settings writes on the phone: a setting is saved through the shared repository and shown at once; the theme
// and the look are the account's and are drawn from this phone's copy the same moment; and every change records the
// undo the web's page records, which puts the old value back (and the old look back on screen).
import { act, renderHook } from "@testing-library/react-native";
import { UndoContext, type UndoApi } from "@/features/undo/undo-context";
import type { UndoEntry } from "@/features/undo/undo-stack";
import type { ReactNode } from "react";
import { lookChoice, resetLookChoice } from "~/ui/looks/look-choice";
import { motionChoice, resetMotion } from "~/ui/motion";
import { resetThemeChoice, themeChoice } from "~/ui/theme-choice";
import { useSettings } from "./use-settings";

const mockUpdate = jest.fn(async (..._args: unknown[]) => undefined);
const mockReplaceDay = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("@/data/repositories/settings-repo", () => ({
  SettingsRepo: jest.fn(() => ({ update: mockUpdate })),
  WorkHoursRepo: jest.fn(() => ({ replaceDay: mockReplaceDay })),
}));
const mockSettings = [{ id: "s1", theme: "light", look: "sky", buffer_pct: 15 }];
const mockHours = [{ weekday: 0, start_time: "09:00:00", end_time: "18:00:00" }];
const mockUsers = [{ id: "u1", email: "sam@example.com", display_name: "Sam", avatar_url: null, personal_space_id: "sp1" }];
jest.mock("@/data/powersync", () => ({
  useLocalDatabase: () => ({}),
  useQuery: (sql: string) => ({ data: /from user_settings/.test(sql) ? mockSettings : /from work_hours/.test(sql) ? mockHours : mockUsers }),
}));

const recorded: UndoEntry[] = [];
const sink = { record: (entry: unknown) => void recorded.push(entry as UndoEntry), undo: async () => false, redo: async () => false, canUndo: false, canRedo: false } as UndoApi;
const wrapper = ({ children }: { children: ReactNode }) => <UndoContext.Provider value={sink}>{children}</UndoContext.Provider>;

beforeEach(() => {
  recorded.length = 0;
  mockUpdate.mockClear();
  mockReplaceDay.mockClear();
  resetThemeChoice();
  resetLookChoice();
  resetMotion();
});

describe("useSettings", () => {
  it("reads the theme and the look from the account's row", async () => {
    const { result } = await renderHook(() => useSettings(), { wrapper });
    expect(result.current.values).toMatchObject({ theme: "light", look: "sky", bufferPct: 15 });
    expect(result.current.motion.value).toBe("system");
  });

  it("writes a look to the account, draws it at once, and records the web's silent undo, which puts the old look back", async () => {
    const { result } = await renderHook(() => useSettings(), { wrapper });
    await act(async () => result.current.change({ look: "tide" }));
    expect(mockUpdate).toHaveBeenLastCalledWith("s1", { look: "tide" });
    expect(lookChoice()).toBe("tide");
    // Shown at once, before the row catches up.
    expect(result.current.values?.look).toBe("tide");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ label: "Changed a setting", toast: false });
    const again = await act(async () => recorded[0].undo());
    expect(mockUpdate).toHaveBeenLastCalledWith("s1", { look: "sky" });
    expect(lookChoice()).toBe("sky");
    // And the way to make it again.
    await act(async () => (again as { redo: () => Promise<void> }).redo());
    expect(mockUpdate).toHaveBeenLastCalledWith("s1", { look: "tide" });
    expect(lookChoice()).toBe("tide");
  });

  it("writes the theme to the account too, and the phone follows at once", async () => {
    const { result } = await renderHook(() => useSettings(), { wrapper });
    await act(async () => result.current.change({ theme: "dark" }));
    expect(mockUpdate).toHaveBeenLastCalledWith("s1", { theme: "dark" });
    expect(themeChoice()).toBe("dark");
    await act(async () => void (await recorded[0].undo()));
    expect(mockUpdate).toHaveBeenLastCalledWith("s1", { theme: "light" });
    expect(themeChoice()).toBe("light");
  });

  it("undoes any other setting to what it was", async () => {
    const { result } = await renderHook(() => useSettings(), { wrapper });
    await act(async () => result.current.change({ bufferPct: 20 }));
    await act(async () => void (await recorded[0].undo()));
    expect(mockUpdate.mock.calls.map((c) => c[1])).toEqual([{ bufferPct: 20 }, { bufferPct: 15 }]);
  });

  it("saves a day's working hours together, and one undo puts the whole day back", async () => {
    const { result } = await renderHook(() => useSettings(), { wrapper });
    const split = [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }];
    await act(async () => result.current.setWorkHours(0, split));
    expect(mockReplaceDay).toHaveBeenLastCalledWith(0, split, { spaceId: "sp1", userId: "u1" });
    expect(recorded[0]).toMatchObject({ label: "Changed working hours", toast: false });
    await act(async () => void (await recorded[0].undo()));
    expect(mockReplaceDay).toHaveBeenLastCalledWith(0, [{ start: "09:00", end: "18:00" }], { spaceId: "sp1", userId: "u1" });
  });

  it("keeps Reduce motion on this phone, never in the account, with its undo", async () => {
    const { result } = await renderHook(() => useSettings(), { wrapper });
    await act(async () => result.current.motion.onChange("reduce"));
    expect(motionChoice()).toBe("reduce");
    expect(result.current.motion.value).toBe("reduce");
    expect(mockUpdate).not.toHaveBeenCalled();
    await act(async () => void (await recorded[0].undo()));
    expect(motionChoice()).toBe("system");
  });
});
