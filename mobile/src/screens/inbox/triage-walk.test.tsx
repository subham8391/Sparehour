// Triage all on the phone, end to end over a stand-in database: the web app's own walk (use-triage-walk.ts) and its
// own writes run under the phone's buttons, and the walk's Undo goes through the app's one undo (ui/undo-provider).
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// Jest here cannot follow chrono-node's "./en" entry (see inbox-view.test.tsx); the entry's own file is handed over.
jest.mock("chrono-node/en", () => jest.requireActual("../../../node_modules/chrono-node/dist/cjs/locales/en/index.js"), { virtual: true });

const mockExecute = jest.fn(async (..._args: unknown[]) => undefined);
const mockGetAll = jest.fn(async () => []);
const mockGetOptional = jest.fn(async (sql: string) => (String(sql).startsWith("select * from tasks") ? { id: "t1", title: "Look into the pricing thing", state: "inbox", do_date: null } : null));
const mockDb = { execute: mockExecute, getAll: mockGetAll, getOptional: mockGetOptional, writeTransaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) => fn({ execute: mockExecute, getOptional: mockGetOptional, getAll: mockGetAll })) };
const mockRows = [
  { id: "t1", title: "Look into the pricing thing", notes_md: "Ask **Dana** what she meant", created_at: "2026-10-01T10:00:00Z", state: "inbox" },
  { id: "t2", title: "Renew the domain", notes_md: null, created_at: "2026-10-01T10:00:00Z", state: "inbox" },
  { id: "t3", title: "That thing Dana mentioned", notes_md: null, created_at: "2026-10-01T10:00:00Z", state: "inbox" },
];
jest.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => {
    if (sql.includes("json_each")) return { data: mockRows, isLoading: false };
    if (sql.includes("from user_settings")) return { data: [{ id: "s", timezone: "UTC", day_rollover_hour: 0 }], isLoading: false };
    return { data: [], isLoading: false };
  },
  useLocalDatabase: () => mockDb,
}));

import { UndoProvider } from "~/ui/undo-provider";
import { TriageWalk } from "./triage-walk";

const onClose = jest.fn();
const setup = (ids: readonly string[] = ["t1", "t2", "t3"]) =>
  render(
    <UndoProvider>
      <TriageWalk ids={ids} onClose={onClose} />
    </UndoProvider>,
  );
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
const shown = (title: string) => screen.getByRole("header", { name: title });

beforeEach(() => {
  mockExecute.mockClear();
  onClose.mockClear();
});

describe("<TriageWalk>", () => {
  it("shows the first task with its age and its note in plain words", async () => {
    await setup();
    expect(shown("Look into the pricing thing")).toBeTruthy();
    expect(screen.getByRole("header", { name: /TRIAGE\s+1 of 3/ })).toBeTruthy();
    expect(screen.getByText(/^added \d+d$/)).toBeTruthy();
    expect(screen.getByText("Ask Dana what she meant")).toBeTruthy();
  });

  it("Today writes the task's day and moves on; Skip leaves one where it is; Back returns to it", async () => {
    await setup();
    await press("Today");
    await waitFor(() => expect(mockExecute).toHaveBeenCalled());
    expect(String(mockExecute.mock.calls[0][0])).toMatch(/^update tasks set do_date = \?/);
    expect((mockExecute.mock.calls[0][1] as unknown[]).at(-1)).toBe("t1");
    expect(shown("Renew the domain")).toBeTruthy();
    await press("Skip");
    expect(shown("That thing Dana mentioned")).toBeTruthy();
    await press("Back");
    expect(shown("Renew the domain")).toBeTruthy();
    // The first was decided, so nothing waits before this one.
    expect(screen.getByRole("button", { name: "Back" }).props.accessibilityState.disabled).toBe(true);
  });

  it("Undo takes the last decision back and returns to that task", async () => {
    await setup();
    await press("Someday");
    expect(shown("Renew the domain")).toBeTruthy();
    expect(screen.getByText("Last: “Look into the pricing thing”")).toBeTruthy();
    await press("Undo the last one");
    await waitFor(() => expect(shown("Look into the pricing thing")).toBeTruthy());
  });

  it("ends on Inbox zero once every task is decided, or on how many stay when some were skipped", async () => {
    const view = await setup(["t1", "t2"]);
    await press("Today");
    await press("This week");
    expect(screen.getByText("Inbox zero. Nice.")).toBeTruthy();
    await press("Done");
    expect(onClose).toHaveBeenCalledTimes(1);
    await view.unmount();

    await setup(["t1", "t2"]);
    await press("Skip");
    await press("Skip");
    expect(screen.getByText("That’s every one. 2 stay in the Inbox for later.")).toBeTruthy();
  });

  it("Estimate… opens its picker over the walk; an estimate alone keeps the task on screen", async () => {
    await setup();
    await press("Estimate…");
    expect(screen.getByRole("header", { name: "Set estimate" })).toBeTruthy();
    await press("45m");
    await waitFor(() => expect(mockExecute).toHaveBeenCalled());
    expect(String(mockExecute.mock.calls[0][0])).toMatch(/^update tasks set estimate_min = \?/);
    expect(screen.queryByRole("header", { name: "Set estimate" })).toBeNull();
    expect(shown("Look into the pricing thing")).toBeTruthy();
  });

  it("is not drawn while there is no queue to walk", async () => {
    await render(
      <UndoProvider>
        <TriageWalk ids={null} onClose={onClose} />
      </UndoProvider>,
    );
    expect(screen.queryByRole("button", { name: "Leave" })).toBeNull();
  });
});
