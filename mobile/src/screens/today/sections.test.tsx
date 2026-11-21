// What was finished on the day: the phone's own rows with Reopen on today, read-only on a day that has passed, and
// for a day older than the phone's week the rows the server kept, with every state of asking for them said in words.
// And Today's rows inside Today's frame: the shared ⋯ with each section's own actions, read from Today's handlers.
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { Task } from "@/core/types";
import { PreviewRows } from "~/screens/rows/preview-rows";
import type { RowsWiring } from "~/screens/rows/rows-frame";
import { TodayRowsContext, type TodayRowHandlers } from "~/screens/rows/today-actions";
import { CarriedSection, DaySection, DoneSection, EveningSection, type DoneProps, type RowContext } from "./sections";
import { TODAY, task } from "./today-fixture";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const done = [task("d1", "Send the invoice", { state: "done", projectId: "p1" })];
const props = (over: Partial<DoneProps> = {}): DoneProps => ({
  label: "Done today",
  tasks: done,
  older: null,
  onReopen: jest.fn(),
  ctx: { today: TODAY, defaultEstimateMin: 35, projectNames: new Map([["p1", "Acme"]]), onComplete: jest.fn(), onOpen: jest.fn() },
  ...over,
});
const older = (status: NonNullable<DoneProps["older"]>["status"], rows: NonNullable<DoneProps["older"]>["rows"] = []) => ({ status, rows, onRetry: jest.fn(), onOpen: jest.fn() });

describe("<DoneSection>", () => {
  it("lists what was finished, struck through, with its project; the ring reopens and the title opens", async () => {
    const p = props();
    await render(<DoneSection {...p} />);
    expect(screen.getByRole("header", { name: /DONE 1/ })).toBeTruthy();
    expect(screen.getByText("Acme")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Reopen Send the invoice" }));
    expect(p.onReopen).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Send the invoice" }));
    expect(p.ctx.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
  });

  it("draws nothing when nothing was finished, and a day that has passed has no Reopen", async () => {
    const view = await render(<DoneSection {...props({ tasks: [] })} />);
    expect(screen.queryByRole("header")).toBeNull();
    await view.rerender(<DoneSection {...props({ onReopen: null })} />);
    expect(screen.getByText("Send the invoice")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Reopen/ })).toBeNull();
  });

  it("an older day lists the server's rows after the phone's own, under one count, and one opens read-only", async () => {
    const o = older("ready", [{ id: "f1", title: "File the tax return", detail: "Home" }]);
    await render(<DoneSection {...props({ onReopen: null, older: o })} />);
    expect(screen.getByRole("header", { name: /DONE 2/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "File the tax return" }));
    expect(o.onOpen).toHaveBeenCalledWith("f1");
  });

  it("says in words that it is asking, that nothing was finished, or that tasks this old are not kept", async () => {
    const view = await render(<DoneSection {...props({ tasks: [], onReopen: null, older: older("loading") })} />);
    expect(screen.getByText("Looking for what you finished on this day…")).toBeTruthy();
    await view.rerender(<DoneSection {...props({ tasks: [], onReopen: null, older: older("ready") })} />);
    expect(screen.getByText("Nothing was finished on this day.")).toBeTruthy();
    await view.rerender(<DoneSection {...props({ tasks: [], onReopen: null, older: older("unavailable") })} />);
    expect(screen.getByText(/^Finished tasks from this long ago are not available/)).toBeTruthy();
    // With rows on the list there is nothing to add.
    await view.rerender(<DoneSection {...props({ onReopen: null, older: older("ready") })} />);
    expect(screen.queryByText("Nothing was finished on this day.")).toBeNull();
  });

  it("offline or on an error it says what is missing, keeps the phone's rows, and offers to try again", async () => {
    const off = older("offline");
    const view = await render(<DoneSection {...props({ onReopen: null, older: off })} />);
    expect(screen.getByText(/^You’re offline\. Older finished tasks need a connection/)).toBeTruthy();
    expect(screen.getByText("Send the invoice")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(off.onRetry).toHaveBeenCalledTimes(1);
    await view.rerender(<DoneSection {...props({ tasks: [], onReopen: null, older: older("error") })} />);
    expect(screen.getByText("Couldn’t load what you finished on this day. Check the connection and try again.")).toBeTruthy();
  });
});

describe("Today's rows in Today's frame", () => {
  const handlers = (): Required<TodayRowHandlers> => ({ onToday: jest.fn(), onTomorrow: jest.fn(), onSomeday: jest.fn(), onDrop: jest.fn(), onConvert: jest.fn(), onMoveUp: jest.fn(), onMoveDown: jest.fn(), onBlock: jest.fn() });
  const ctx = (over: Partial<RowContext> = {}): RowContext => ({ today: TODAY, defaultEstimateMin: 35, onComplete: jest.fn(), onOpen: jest.fn(), ...over });
  const framed = (ui: React.ReactNode, on: TodayRowHandlers | null, wiring: Partial<RowsWiring> = {}) =>
    render(
      <PreviewRows today={TODAY} wiring={wiring}>
        <TodayRowsContext.Provider value={on}>{ui}</TodayRowsContext.Provider>
      </PreviewRows>,
    );
  const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));
  const day = (c: RowContext, tasks: Task[]) => <DaySection label="Today" tasks={tasks} state="planned" spareMin={0} pullIn={[]} pulling={false} onPull={jest.fn()} onPullIn={jest.fn()} onPlan={jest.fn()} onShutdown={jest.fn()} ctx={c} />;
  const draft = task("t1", "Draft the proposal", { doDate: TODAY });

  it("a row of the day: Move up, Move down, Block and Convert to project are its own; Tomorrow, Someday and the rest are the menu's", async () => {
    const on = handlers();
    const wiring = { onSnooze: jest.fn(), onSomeday: jest.fn() };
    const c = ctx();
    await framed(day(c, [draft]), on, wiring);
    await press("More actions for Draft the proposal");
    for (const name of ["Move up", "Move down", "Convert to project", "Complete", "Move to project…", "Add a tag…", "Duplicate", "Copy link", "This evening", "Someday", "Move to…"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Tomorrow" })).toHaveLength(1);
    // The line shows "Block"; a screen reader hears which task.
    await press("Block Draft the proposal");
    expect(on.onBlock).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
    await press("More actions for Draft the proposal");
    await press("Tomorrow");
    expect(wiring.onSnooze).toHaveBeenCalledWith(["t1"], expect.objectContaining({ id: "tomorrow" }));
    await press("More actions for Draft the proposal");
    await press("Complete");
    expect(c.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
  });

  it("a carried-over row: Today and Drop are Today's own writes; one being asked about has no ⋯", async () => {
    const on = handlers();
    const carried = task("c1", "Renew the passport", { doDate: TODAY.subtract({ days: 2 }), carryCount: 2 });
    const asked = { ...task("c2", "Sort the garage", { doDate: TODAY.subtract({ days: 5 }), carryCount: 3 }), ask: true };
    await framed(<CarriedSection tasks={[carried, asked]} folded={false} onExpand={jest.fn()} onClearSlate={jest.fn()} onKeep={jest.fn()} onSomeday={jest.fn()} onBreakDown={jest.fn()} onDrop={jest.fn()} onAllTomorrow={jest.fn()} onAllSomeday={jest.fn()} ctx={ctx()} />, on);
    expect(screen.queryByRole("button", { name: "More actions for Sort the garage" })).toBeNull();
    await press("More actions for Renew the passport");
    await press("Today");
    expect(on.onToday).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    await press("More actions for Renew the passport");
    // The asked row's own Drop is in the list; the menu's is the one drawn last, over it.
    const drops = screen.getAllByRole("button", { name: "Drop" });
    await fireEvent.press(drops[drops.length - 1]);
    expect(on.onDrop).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
  });

  it("an evening row has Convert to project and the menu's own; a held press ticks rows and the bulk bar shows", async () => {
    const on = handlers();
    const late = task("e1", "Read the brief", { doDate: TODAY, evening: true });
    await framed(<EveningSection tasks={[late]} open onToggle={jest.fn()} full={false} ctx={ctx()} />, on);
    await press("More actions for Read the brief");
    await press("Convert to project");
    expect(on.onConvert).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }));
    await fireEvent(screen.getByRole("button", { name: "Read the brief" }), "longPress");
    expect(screen.getByLabelText("Bulk edit")).toBeTruthy();
  });

  it("a finished row's ⋯ reopens it, as its ring does", async () => {
    const p = props();
    await framed(<DoneSection {...p} />, handlers());
    await press("More actions for Send the invoice");
    await press("Reopen");
    expect(p.onReopen).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
  });

  it("without Today's handlers, or outside a frame, a row's ⋯ asks Today's view as it did before", async () => {
    const onMore = jest.fn();
    const view = await framed(day(ctx({ onMore }), [draft]), null);
    await press("More actions for Draft the proposal");
    expect(onMore).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
    expect(screen.queryByRole("button", { name: "Move to…" })).toBeNull();
    view.unmount();
    await render(day(ctx({ onMore }), [draft]));
    await press("More actions for Draft the proposal");
    expect(onMore).toHaveBeenCalledTimes(2);
    // And with no sheet to ask, there is no ⋯ at all.
    await render(day(ctx(), [task("t9", "Plain row", { doDate: TODAY })]));
    expect(screen.queryByRole("button", { name: "More actions for Plain row" })).toBeNull();
  });
});
