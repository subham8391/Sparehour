// Browse as the phone draws it: the search entry, the tree with its counts, the folded finished projects, the rows
// under it, and what each control asks for. The organise sheet's steps are tested with it.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { browseRows } from "@/app/(app)/browse/browse-rows";
import { LOOSE_GROUP_ID, type ProjectGroup } from "@/data/queries/nav";
import { BrowseView, type BrowseViewProps } from "./browse-view";
import { OrganiseSheet, type OrganiseSheetProps } from "./organise-sheet";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => false }) }));

const AREAS: ProjectGroup[] = [
  { id: "a1", name: "Work", projects: [{ id: "p1", name: "Acme launch" }, { id: "p2", name: "Quarterly report" }] },
  { id: "a2", name: "Health", projects: [] },
  { id: LOOSE_GROUP_ID, name: "Projects", projects: [{ id: "p3", name: "Read more" }], loose: true },
];
const props = (over: Partial<BrowseViewProps> = {}): BrowseViewProps => ({
  areas: AREAS,
  finished: [{ id: "f1", name: "Website", area_id: "a1", state: "archived" }],
  rows: browseRows(),
  adding: null,
  onSearch: jest.fn(),
  onAddArea: jest.fn(),
  onCreate: jest.fn(),
  onOpenArea: jest.fn(),
  onOpenProject: jest.fn(),
  onOrganise: jest.fn(),
  onOpenRow: jest.fn(),
  ...over,
});

describe("<BrowseView>", () => {
  it("lists the areas with their projects and counts, the no-area group as a heading, and the web's rows under them", async () => {
    await render(<BrowseView {...props()} />);
    expect(screen.getByRole("header", { name: "Everything else" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Work" })).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Acme launch" })).toBeTruthy();
    // An area with no project shows no count; the trailing group is plain words, not a place.
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByRole("header", { name: "Projects, 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Projects" })).toBeNull();
    for (const label of ["Someday", "Logbook", "Carried over", "Settings"]) expect(screen.getByRole("button", { name: label })).toBeTruthy();
  });

  it("opens search, an area, a project and a row, and asks to organise a row from its ⋯", async () => {
    const p = props();
    await render(<BrowseView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Search tasks, notes, projects" }));
    expect(p.onSearch).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Work" }));
    expect(p.onOpenArea).toHaveBeenCalledWith("a1");
    await fireEvent.press(screen.getByRole("button", { name: "Read more" }));
    expect(p.onOpenProject).toHaveBeenCalledWith("p3");
    await fireEvent.press(screen.getByRole("button", { name: "Logbook" }));
    expect(p.onOpenRow).toHaveBeenCalledWith(expect.objectContaining({ id: "logbook", href: "/logbook" }));
    await fireEvent.press(screen.getByRole("button", { name: "Organise Work" }));
    expect(p.onOrganise).toHaveBeenCalledWith({ kind: "area", id: "a1", name: "Work" });
    await fireEvent.press(screen.getByRole("button", { name: "Organise Quarterly report" }));
    expect(p.onOrganise).toHaveBeenCalledWith({ kind: "project", id: "p2", name: "Quarterly report" });
  });

  it("keeps completed and archived projects folded, with their state once open", async () => {
    const p = props();
    await render(<BrowseView {...p} />);
    expect(screen.queryByText("Website")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Completed and archived, 1" }));
    expect(screen.getByText("Archived")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Website" }));
    expect(p.onOpenProject).toHaveBeenCalledWith("f1");
  });

  it("offers Add area beside the label, and in the empty state when there are none", async () => {
    const p = props();
    const view = await render(<BrowseView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Add area" }));
    expect(p.onAddArea).toHaveBeenCalledTimes(1);
    await view.rerender(<BrowseView {...props({ areas: [], finished: [] })} />);
    expect(screen.getByText("No areas yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add area" })).toBeTruthy();
  });

  it("the name field makes the area once, on Done or on leaving it, and hides Add area meanwhile", async () => {
    const p = props({ adding: "area" });
    await render(<BrowseView {...p} />);
    expect(screen.queryByRole("button", { name: "Add area" })).toBeNull();
    const field = screen.getByLabelText("Area name");
    await fireEvent.changeText(field, "Home");
    await fireEvent(field, "submitEditing");
    await fireEvent(field, "blur");
    expect(p.onCreate).toHaveBeenCalledTimes(1);
    expect(p.onCreate).toHaveBeenCalledWith("Home");
  });

  it("names the field for a project when one is asked for", async () => {
    await render(<BrowseView {...props({ adding: "project" })} />);
    expect(screen.getByLabelText("Project name")).toBeTruthy();
  });
});

const sheet = (over: Partial<OrganiseSheetProps> = {}): OrganiseSheetProps => ({
  target: { kind: "project", id: "p2", name: "Quarterly report" },
  step: "menu",
  canMoveUp: true,
  canMoveDown: false,
  areas: [{ id: "a1", name: "Work" }, { id: "a2", name: "Health" }],
  areaId: "a1",
  deleteNote: "Its 2 projects and 5 tasks stay, without an area.",
  onStep: jest.fn(),
  onNudge: jest.fn(),
  onMoveTo: jest.fn(),
  onDelete: jest.fn(),
  onClose: jest.fn(),
  ...over,
});

describe("<OrganiseSheet>", () => {
  it("a project's menu moves it up or down where it can, and leads to Move to area…", async () => {
    const p = sheet();
    await render(<OrganiseSheet {...p} />);
    expect(screen.getByRole("header", { name: "Quarterly report" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Move down" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Move up" }));
    expect(p.onNudge).toHaveBeenCalledWith(-1);
    await fireEvent.press(screen.getByRole("button", { name: "Move to area…" }));
    expect(p.onStep).toHaveBeenCalledWith("move");
    expect(screen.queryByRole("button", { name: "Delete area…" })).toBeNull();
  });

  it("Move to area lists the areas with the current one ticked, and No area", async () => {
    const p = sheet({ step: "move" });
    await render(<OrganiseSheet {...p} />);
    expect(screen.getByRole("header", { name: "Move “Quarterly report” to" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Work" }).props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(screen.getByRole("button", { name: "Health" }));
    expect(p.onMoveTo).toHaveBeenCalledWith("a2");
    await fireEvent.press(screen.getByRole("button", { name: "No area" }));
    expect(p.onMoveTo).toHaveBeenCalledWith(null);
  });

  it("an area's delete says what stays and asks once: Keep or Delete area", async () => {
    const p = sheet({ target: { kind: "area", id: "a1", name: "Work" }, step: "delete" });
    await render(<OrganiseSheet {...p} />);
    expect(screen.getByRole("header", { name: "Delete “Work”?" })).toBeTruthy();
    expect(screen.getByText("Its 2 projects and 5 tasks stay, without an area.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Keep" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(p.onDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Delete area" }));
    expect(p.onDelete).toHaveBeenCalledTimes(1);
  });

  it("an area's menu leads to Delete area…", async () => {
    const p = sheet({ target: { kind: "area", id: "a1", name: "Work" } });
    await render(<OrganiseSheet {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Delete area…" }));
    expect(p.onStep).toHaveBeenCalledWith("delete");
  });
});
