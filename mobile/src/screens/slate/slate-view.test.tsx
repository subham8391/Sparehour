// Clear the slate as the phone draws it: the two scopes with their counts, the question with its guarantee, and the
// one batch the button asks for.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SlateView, type SlateViewProps } from "./slate-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));

const props = (over: Partial<SlateViewProps> = {}): SlateViewProps => ({ counts: { today: 12, backlog: 35 }, onConfirm: jest.fn(async () => 12), onClose: jest.fn(), ...over });
const scope = (name: string | RegExp) => screen.getByRole("radio", { name });

describe("<SlateView>", () => {
  it("offers Today only and Today + backlog with what each takes, Today only chosen", async () => {
    await render(<SlateView {...props()} />);
    expect(screen.getByRole("header", { name: "Clear the slate" })).toBeTruthy();
    expect(screen.getByLabelText("What to archive")).toBeTruthy();
    expect(scope("Today only, 12").props.accessibilityState).toEqual(expect.objectContaining({ checked: true }));
    expect(scope("Today + backlog, 47").props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    expect(screen.getByText("Everything dated today or earlier, Carried over included")).toBeTruthy();
    expect(screen.getByText("Adds active tasks with no date")).toBeTruthy();
  });

  it("names the number and the guarantee, and what stays as it is", async () => {
    await render(<SlateView {...props()} />);
    expect(screen.getByText("Archive 12 tasks? Nothing is deleted — you can bring the whole batch back for 30 days.")).toBeTruthy();
    expect(screen.getByText("The Inbox and repeating tasks stay as they are.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive 12 tasks" })).toBeTruthy();
  });

  it("the other scope changes the count, and the button archives that scope as one batch, then closes", async () => {
    const p = props();
    await render(<SlateView {...p} />);
    await fireEvent.press(scope("Today + backlog, 47"));
    expect(screen.getByText("Archive 47 tasks? Nothing is deleted — you can bring the whole batch back for 30 days.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Archive 47 tasks" }));
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
    expect(p.onConfirm).toHaveBeenCalledWith("backlog");
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("says Archiving… while the batch is written, and takes no second tap", async () => {
    let finish: () => void = () => undefined;
    const p = props({ onConfirm: jest.fn(() => new Promise<void>((resolve) => (finish = resolve))) });
    await render(<SlateView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Archive 12 tasks" }));
    const busy = screen.getByRole("button", { name: "Archiving…" });
    expect(busy.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(busy);
    expect(p.onConfirm).toHaveBeenCalledTimes(1);
    expect(p.onClose).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("with nothing in the scope it says so and the button waits", async () => {
    const p = props({ counts: { today: 0, backlog: 3 } });
    await render(<SlateView {...p} />);
    expect(screen.getByText("Nothing to archive here.")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Archive" });
    expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(scope("Today + backlog, 3"));
    expect(screen.getByRole("button", { name: "Archive 3 tasks" })).toBeTruthy();
  });

  it("says Counting… until the counts are in", async () => {
    await render(<SlateView {...props({ counts: undefined })} />);
    expect(screen.getByText("Counting…")).toBeTruthy();
    expect(scope("Today only, counting")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive" }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it("a batch that could not be written says nothing changed and stays open to try again", async () => {
    const p = props({ onConfirm: jest.fn(async () => Promise.reject(new Error("no"))) });
    await render(<SlateView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Archive 12 tasks" }));
    expect(screen.getByText("Couldn’t archive them — nothing changed. Try again.")).toBeTruthy();
    expect(p.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Archive 12 tasks" }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it("Cancel closes without archiving", async () => {
    const p = props();
    await render(<SlateView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(p.onConfirm).not.toHaveBeenCalled();
  });
});
