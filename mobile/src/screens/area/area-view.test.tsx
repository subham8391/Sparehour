// An area's page as the phone draws it: its name, its projects as cards, the tasks filed in it directly, its finished
// projects, and what each control asks for.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { localDate } from "@/core/time";
import type { Task } from "@/core/types";
import { deleteAreaNote } from "@/features/projects/organise-place";
import { PreviewRows } from "~/screens/rows/preview-rows";
import { AreaMissingView, AreaView, type AreaViewProps } from "./area-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));

const TODAY = localDate("2026-11-21");
const task = (id: string, title: string, more: Partial<Task> = {}) => ({ id, title, state: "active", estimateMin: 30, carryCount: 0, projectId: null, areaId: "a1", doDate: null, doTime: null, deadline: null, startDate: null, sortKey: id, ...more }) as unknown as Task;

const props = (over: Partial<AreaViewProps> = {}): AreaViewProps => ({
  id: "a1",
  name: "Home",
  today: TODAY,
  defaultEstimateMin: 35,
  count: "2 projects",
  cards: [
    { id: "p1", name: "Kitchen", share: 0.25, figures: "1 done this week · 3 open · ~1h 30m", deadline: TODAY.subtract({ days: 2 }) },
    { id: "p2", name: "Garden", share: 0, figures: "0 open", deadline: null },
  ],
  finished: [{ id: "f1", name: "Old move", area_id: "a1", state: "archived" }],
  tasks: [task("l1", "Renew the passport", { doDate: TODAY.add({ days: 1 }) }), task("l2", "Call the plumber", { state: "inbox" })],
  deleteNote: deleteAreaNote(3, 2),
  onRename: jest.fn(),
  onOpenProject: jest.fn(),
  onAddProject: jest.fn(),
  onAdd: jest.fn(),
  onComplete: jest.fn(),
  onOpen: jest.fn(),
  onMoveTask: jest.fn(),
  onDelete: jest.fn(),
  ...over,
});

describe("<AreaView>", () => {
  it("shows the name in a field that saves when left, how many projects, and Back", async () => {
    const p = props();
    await render(<AreaView {...p} />);
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByText("2 projects")).toBeTruthy();
    const name = screen.getByLabelText("Area name");
    expect(name.props.value).toBe("Home");
    await fireEvent.changeText(name, "House");
    await fireEvent(name, "blur");
    expect(p.onRename).toHaveBeenCalledWith("House");
  });

  it("a project's card says its figures and its deadline, draws its bar, and opens the project", async () => {
    const p = props();
    await render(<AreaView {...p} />);
    expect(screen.getByText("1 done this week · 3 open · ~1h 30m")).toBeTruthy();
    // Only a missed deadline is red, and it is said as missed.
    expect(screen.getByLabelText("Deadline missed 2d late")).toBeTruthy();
    expect(screen.getAllByTestId("project-progress", { includeHiddenElements: true })).toHaveLength(2);
    await fireEvent.press(screen.getByRole("button", { name: "Kitchen, 1 done this week · 3 open · ~1h 30m" }));
    expect(p.onOpenProject).toHaveBeenCalledWith("p1");
  });

  it("Add project opens a name field; Done makes the project, and an empty name makes nothing", async () => {
    const p = props();
    await render(<AreaView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Add project" }));
    await fireEvent.changeText(screen.getByLabelText("Project name"), " Bathroom ");
    await fireEvent(screen.getByLabelText("Project name"), "submitEditing");
    expect(p.onAddProject).toHaveBeenCalledWith("Bathroom");
    expect(screen.getByRole("button", { name: "Add project" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Add project" }));
    await fireEvent(screen.getByLabelText("Project name"), "blur");
    expect(p.onAddProject).toHaveBeenCalledTimes(1);
  });

  it("lists the tasks filed in the area, with their day; the ring completes and the title opens", async () => {
    const p = props();
    await render(<AreaView {...p} />);
    expect(screen.getByRole("header", { name: "TASKS" })).toBeTruthy();
    expect(screen.getByText("Tomorrow")).toBeTruthy();
    expect(screen.getByText("Inbox")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Complete Renew the passport" }));
    expect(p.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "l1" }));
    await fireEvent.press(screen.getByRole("button", { name: "Call the plumber" }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "l2" }));
  });

  it("the tasks end with an add line that asks for a new task in the area", async () => {
    const p = props();
    await render(<AreaView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Add to Home" }));
    expect(p.onAdd).toHaveBeenCalledTimes(1);
  });

  it("a row's ⋯ is the shared menu: it moves the row one place, only the ways it can go, and snoozes or parks it", async () => {
    const p = props();
    const wiring = { onSnooze: jest.fn(), onSomeday: jest.fn() };
    // Inside its screen's frame, as area.tsx draws it.
    await render(
      <PreviewRows today={TODAY} wiring={wiring}>
        <AreaView {...p} />
      </PreviewRows>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Renew the passport" }));
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Move down" }));
    expect(p.onMoveTask).toHaveBeenCalledWith(expect.objectContaining({ id: "l1" }), 1);
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Call the plumber" }));
    expect(screen.queryByRole("button", { name: "Move down" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Next week" }));
    expect(wiring.onSnooze).toHaveBeenCalledWith(["l2"], expect.objectContaining({ id: "nextweek" }));
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Call the plumber" }));
    await fireEvent.press(screen.getByRole("button", { name: "Someday" }));
    expect(wiring.onSomeday).toHaveBeenCalledWith("l2");
    await fireEvent.press(screen.getByRole("button", { name: "More actions for Call the plumber" }));
    await fireEvent.press(screen.getByRole("button", { name: "Complete" }));
    expect(p.onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "l2" }));
  });

  it("its completed and archived projects are folded away, each saying its state and opening its page", async () => {
    const p = props();
    await render(<AreaView {...p} />);
    expect(screen.queryByRole("button", { name: "Old move" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Completed and archived, 1" }));
    expect(screen.getByText("Archived")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Old move" }));
    expect(p.onOpenProject).toHaveBeenCalledWith("f1");
  });

  it("the header's ⋯ offers Delete area…, which says what stays before it deletes", async () => {
    const p = props();
    await render(<AreaView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Area actions" }));
    // Moving an area up or down is Browse's; here there is the one line.
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Delete area…" }));
    expect(screen.getByRole("header", { name: "Delete “Home”?" })).toBeTruthy();
    expect(screen.getByText("Its 3 projects and 2 tasks stay, without an area.")).toBeTruthy();
    expect(p.onDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Delete area" }));
    expect(p.onDelete).toHaveBeenCalledTimes(1);
  });

  it("Keep leaves the area as it is", async () => {
    const p = props();
    await render(<AreaView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Area actions" }));
    await fireEvent.press(screen.getByRole("button", { name: "Delete area…" }));
    await fireEvent.press(screen.getByRole("button", { name: "Keep" }));
    expect(p.onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("header", { name: "Delete “Home”?" })).toBeNull();
  });

  it("with nothing filed in it, still offers Add project and the add line", async () => {
    await render(<AreaView {...props({ count: "0 projects", cards: [], finished: [], tasks: [] })} />);
    expect(screen.getByText("0 projects")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add project" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add to Home" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Completed and archived/ })).toBeNull();
  });
});

describe("<AreaMissingView>", () => {
  it("says the area is not on this device, and offers Browse", async () => {
    const onBrowse = jest.fn();
    await render(<AreaMissingView onBrowse={onBrowse} />);
    expect(screen.getByRole("header", { name: "Not here" })).toBeTruthy();
    expect(screen.getByText("This area isn’t on this device.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Browse" }));
    expect(onBrowse).toHaveBeenCalledTimes(1);
  });
});
