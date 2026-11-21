// What was finished on the day: the phone's own rows with Reopen on today, read-only on a day that has passed, and
// for a day older than the phone's week the rows the server kept, with every state of asking for them said in words.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { DoneSection, type DoneProps } from "./sections";
import { TODAY, task } from "./today-fixture";

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
