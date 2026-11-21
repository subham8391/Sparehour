// Quick add as the phone draws it: the line read by the web's own parser, the strip of what was understood, the day
// or the area the sheet was opened on, the project and tag suggestions, what a save is handed and what it says after.
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { Temporal, localDate } from "@/core/time";
import { colours } from "~/ui/theme";
import { wordsIn } from "./box-words";
import { QuickAddView, type QuickAddViewProps } from "./quick-add-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// Jest here cannot follow chrono-node's "./en" entry (a subpath in the package's `exports`), which the shared quick-add
// parser imports; Metro can. The entry's own file is handed over, so a day typed in words is read by the real parser.
jest.mock("chrono-node/en", () => jest.requireActual("../../../node_modules/chrono-node/dist/cjs/locales/en/index.js"), { virtual: true });

const today = localDate("2026-11-21"); // a Saturday
const PROJECTS = [
  { id: "p1", name: "Acme launch", area: "Work" },
  { id: "p2", name: "Website", area: "Work" },
  { id: "p3", name: "Website", area: "Personal" },
];
const TAGS = [
  { id: "g1", name: "calls" },
  { id: "g2", name: "calendar" },
];
const props = (over: Partial<QuickAddViewProps> = {}): QuickAddViewProps => ({
  open: true,
  projects: PROJECTS,
  tags: TAGS,
  ctx: { now: Temporal.Instant.from("2026-11-21T10:00:00Z"), zone: "UTC", today },
  onClose: jest.fn(),
  onSubmit: jest.fn(async () => "new-id"),
  onDiscard: jest.fn(),
  ...over,
});
const box = () => screen.getByLabelText("Task");
/** The words in the box, every space kept. */
const said = () => wordsIn(box());
const type = (text: string) => fireEvent.changeText(box(), text);
const press = (name: string | RegExp) => fireEvent.press(screen.getByRole("button", { name }));
const done = async () => {
  await act(async () => {
    await fireEvent(box(), "submitEditing");
  });
};
const submitted = (p: QuickAddViewProps, call = 0) => (p.onSubmit as jest.Mock).mock.calls[call] as [{ draft: { title: string; doDate: { toString(): string } | null; estimateMin: number | null; tagNames: string[] }; projectId: string | null; createProjectName: string | null }, { pageProject: boolean; areaId: string | null }];

describe("<QuickAddView>", () => {
  it("opens empty, says what is understood, and offers the tokens to tap", async () => {
    await render(<QuickAddView {...props()} />);
    expect(screen.getByRole("header", { name: "Quick add" })).toBeTruthy();
    expect(said()).toBe("");
    expect(screen.getByText("Dates, times, ~estimates, #projects, @tags and !priority are understood.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" }).props.accessibilityState.disabled).toBe(true);
    await press("tmrw");
    expect(said()).toBe("tomorrow");
    await type("Call the bank");
    await press("~30m");
    expect(said()).toBe("Call the bank ~30m");
  });

  it("restates the line as chips, with where the task will go", async () => {
    await render(<QuickAddView {...props()} />);
    await type("Draft the proposal tomorrow 3pm ~45m !1 {fri} every week");
    // Each as a chip of the strip ("every week" is also a run of the line itself, painted where it was typed).
    for (const words of ["Tomorrow 15:00", "45m", "Due Fri", "every week", "priority 1"]) expect(screen.getByRole("button", { name: `Remove “${words}”` })).toBeTruthy();
    expect(screen.getByLabelText("Goes to Upcoming")).toBeTruthy();
    await type("Call the bank");
    expect(screen.getByLabelText("Goes to Inbox")).toBeTruthy();
    await type("Call the bank evening");
    expect(screen.getByText("Today, evening")).toBeTruthy();
    expect(screen.getByLabelText("Goes to Today")).toBeTruthy();
  });

  it("a line of tokens and no words asks for a name and cannot be added", async () => {
    const p = props();
    await render(<QuickAddView {...p} />);
    await type("tomorrow ~30m");
    expect(screen.getByText("Give it a name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" }).props.accessibilityState.disabled).toBe(true);
    await done();
    expect(p.onSubmit).not.toHaveBeenCalled();
  });

  it("a chip's × turns its words back into title words", async () => {
    const p = props();
    await render(<QuickAddView {...p} />);
    await type("Plan tomorrow ~30m");
    await press("Remove “Tomorrow”");
    expect(screen.queryByText("Tomorrow")).toBeNull();
    expect(screen.getByText("30m")).toBeTruthy();
    await done();
    expect(submitted(p)[0].draft).toMatchObject({ title: "Plan tomorrow", doDate: null, estimateMin: 30 });
  });

  it("Done saves, clears the box for the next line, and says where the task went", async () => {
    const p = props();
    await render(<QuickAddView {...p} />);
    await type("Email the accountant #acme @calls");
    // A partial name that fits one project is filed there, and the strip says so before the save.
    expect(screen.getByRole("button", { name: "Remove “Acme launch”" })).toBeTruthy();
    await done();
    const [sent, here] = submitted(p);
    expect(sent).toMatchObject({ projectId: "p1", createProjectName: null });
    expect(sent.draft).toMatchObject({ title: "Email the accountant", tagNames: ["calls"] });
    expect(here).toEqual({ pageProject: false, areaId: null });
    expect(said()).toBe("");
    expect(screen.getByText("Added “Email the accountant” to Acme launch")).toBeTruthy();
    expect(p.onClose).not.toHaveBeenCalled();
    await type("Second line");
    await act(async () => {
      await press("Add");
    });
    expect(submitted(p, 1)[0].draft.title).toBe("Second line");
    expect(screen.getByText("Added “Second line”")).toBeTruthy();
  });

  it("opened on a day, the day is beside the line from the start and a line that names none is for it", async () => {
    const p = props({ here: { day: localDate("2026-11-24") } });
    await render(<QuickAddView {...p} />);
    expect(said()).toBe("");
    expect(screen.getByText("Tue 24 Nov")).toBeTruthy();
    expect(screen.getByLabelText("Goes to Upcoming")).toBeTruthy();
    await type("Workout 8am");
    expect(screen.getByText("Tue 24 Nov 08:00")).toBeTruthy();
    await done();
    expect(submitted(p)[0].draft.doDate?.toString()).toBe("2026-11-24");
    // A line with its own day keeps it.
    await type("Call the bank tomorrow");
    await done();
    expect(submitted(p, 1)[0].draft.doDate?.toString()).toBe("2026-11-22");
  });

  it("the day's × takes it off for this sheet, and the line goes to the Inbox", async () => {
    const p = props({ here: { day: today } });
    await render(<QuickAddView {...p} />);
    expect(screen.getByLabelText("Goes to Today")).toBeTruthy();
    await press("Remove “Today”");
    await type("Call the bank");
    expect(screen.getByLabelText("Goes to Inbox")).toBeTruthy();
    await done();
    expect(submitted(p)[0].draft.doDate).toBeNull();
  });

  it("a day that has passed takes the task on today", async () => {
    const p = props({ here: { day: localDate("2026-11-19") } });
    await render(<QuickAddView {...p} />);
    expect(screen.getByRole("button", { name: "Remove “Today”" })).toBeTruthy();
    await type("Call the bank");
    await done();
    expect(submitted(p)[0].draft.doDate?.toString()).toBe("2026-11-21");
  });

  it("opened on a project's page, a line that names no project goes into it", async () => {
    const p = props({ here: { projectId: "p1" } });
    await render(<QuickAddView {...p} />);
    expect(screen.getByRole("button", { name: "Remove “Acme launch”" })).toBeTruthy();
    expect(screen.getByLabelText("Goes to Acme launch")).toBeTruthy();
    await type("Write the brief");
    await done();
    expect(submitted(p)[0].projectId).toBe("p1");
    expect(submitted(p)[1]).toEqual({ pageProject: true, areaId: null });
    expect(screen.getByText("Added “Write the brief” to Acme launch")).toBeTruthy();
  });

  it("opened on an area's page, a line with no project is filed in the area", async () => {
    const p = props({ here: { area: { id: "a1", name: "Work" } } });
    await render(<QuickAddView {...p} />);
    expect(screen.getByLabelText("Goes to Work")).toBeTruthy();
    await type("Renew the insurance");
    await done();
    expect(submitted(p)[1]).toEqual({ pageProject: false, areaId: "a1" });
    expect(screen.getByText("Added “Renew the insurance” to Work")).toBeTruthy();
    // A line that names a project goes to the project, not the area.
    await type("Email the accountant #acme");
    await done();
    expect(submitted(p, 1)[0].projectId).toBe("p1");
    expect(submitted(p, 1)[1].areaId).toBeNull();
  });

  it("a typed # offers the projects it fits, and a pick is written into the line", async () => {
    const p = props();
    await render(<QuickAddView {...p} />);
    await type("Fix the footer #web");
    // Two projects of one name are told apart by their area.
    expect(screen.getByRole("button", { name: "Website · Work" })).toBeTruthy();
    await press("Website · Personal");
    expect(said()).toBe("Fix the footer #Website");
    expect(screen.getByLabelText("Goes to Website · Personal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Website · Work" })).toBeNull();
    await done();
    expect(submitted(p)[0].projectId).toBe("p3");
  });

  it("a name two projects share files nowhere and offers no Create until one is picked", async () => {
    await render(<QuickAddView {...props()} />);
    await type("Fix the footer #website");
    expect(screen.getByText("Website?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Website · Work" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Create/ })).toBeNull();
  });

  it("a name no project has can be made a new project", async () => {
    const p = props();
    await render(<QuickAddView {...p} />);
    await type("Book the venue #offsite");
    expect(screen.getByText("offsite?")).toBeTruthy();
    await press("Create “offsite”");
    expect(screen.getByText("new project offsite")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Will create “offsite”" })).toBeTruthy();
    await done();
    expect(submitted(p)[0]).toMatchObject({ projectId: null, createProjectName: "offsite" });
    expect(screen.getByText("Added “Book the venue” to offsite")).toBeTruthy();
  });

  it("a #name that files nowhere stays in the title, and the notice says why", async () => {
    const p = props();
    await render(<QuickAddView {...p} />);
    await type("Book the venue #offsite");
    await done();
    expect(submitted(p)[0]).toMatchObject({ projectId: null, createProjectName: null });
    expect(submitted(p)[0].draft.title).toBe("Book the venue #offsite");
    expect(screen.getByText("Added “Book the venue #offsite” — no project is called “offsite”, so it stays in the title")).toBeTruthy();
  });

  it("a typed @ offers the tags it fits and the way to make a new one", async () => {
    const p = props();
    await render(<QuickAddView {...p} />);
    await type("Ring Dana @cal");
    expect(screen.getByRole("button", { name: "@calls" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create @cal" })).toBeTruthy();
    expect(screen.getByText("new tag @cal")).toBeTruthy();
    await press("@calendar");
    expect(said()).toBe("Ring Dana @calendar ");
    expect(screen.getByRole("button", { name: "Remove “@calendar”" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Create @/ })).toBeNull();
  });

  it("the tag row follows the caret", async () => {
    await render(<QuickAddView {...props()} />);
    await type("Ring Dana @cal about it");
    expect(screen.queryByRole("button", { name: "Create @cal" })).toBeNull();
    await fireEvent(box(), "selectionChange", { nativeEvent: { selection: { start: 14, end: 14 } } });
    expect(screen.getByRole("button", { name: "Create @cal" })).toBeTruthy();
  });

  it("says what tasks like this usually take, and Use writes it into the line", async () => {
    const usual = jest.fn((task: { estimateMin: number | null }) => (task.estimateMin === 60 ? null : 60));
    await render(<QuickAddView {...props({ usual })} />);
    expect(screen.queryByText(/usually take you/)).toBeNull();
    await type("Write the report ~30m tomorrow");
    expect(screen.getByText("Tasks like this usually take you 1h.")).toBeTruthy();
    await press("Use 1h");
    expect(said()).toBe("Write the report ~1h tomorrow");
    expect(screen.queryByText(/usually take you/)).toBeNull();
  });

  it("draws the day line it is handed, for the draft as it would be saved, and a note on the parse", async () => {
    const dayLine = jest.fn(() => null);
    await render(<QuickAddView {...props({ here: { day: today }, dayLine })} />);
    expect(dayLine).not.toHaveBeenCalled();
    await type("Write the report ~30m");
    const draft = (dayLine.mock.calls.at(-1) as unknown as [{ doDate: { toString(): string }; estimateMin: number }])[0];
    expect(draft.doDate.toString()).toBe("2026-11-21");
    expect(draft.estimateMin).toBe(30);
    await type("Write the report tomorrow {today}");
    expect(screen.getByText("Due before you plan to do it.")).toBeTruthy();
  });

  it("a save that fails says so and puts the words back in the box", async () => {
    const p = props({ onSubmit: jest.fn(async () => Promise.reject(new Error("Your account is still loading — try again in a moment."))) });
    await render(<QuickAddView {...p} />);
    await type("Call the bank");
    await done();
    expect(screen.getByText("Couldn't save “Call the bank”: Your account is still loading — try again in a moment.")).toBeTruthy();
    expect(said()).toBe("Call the bank");
  });

  it("closing with words in the box hands them back to be offered again; an empty box just closes", async () => {
    const p = props();
    const view = await render(<QuickAddView {...p} />);
    await press("Close");
    expect(p.onClose).toHaveBeenCalledTimes(1);
    expect(p.onDiscard).not.toHaveBeenCalled();
    await view.rerender(<QuickAddView {...p} />);
    await type("Call the bank tomorrow");
    await press("Close");
    expect(p.onDiscard).toHaveBeenCalledWith("Call the bank tomorrow", "Call the bank");
    expect(p.onClose).toHaveBeenCalledTimes(2);
  });

  it("opens holding the words it is handed", async () => {
    await render(<QuickAddView {...props({ initial: "Pricing review" })} />);
    expect(said()).toBe("Pricing review");
    expect(screen.getByLabelText("Goes to Inbox")).toBeTruthy();
  });

  describe("tokens painted in the line as they are recognised", () => {
    const colourOf = (words: string) => (within(box()).getByText(words).props.style as { color?: string } | undefined)?.color;

    it("a date, an estimate, a tag, a priority and a repeat step back to ink-2, a project is the meet token, a note ink-3; the title stays ink", async () => {
      await render(<QuickAddView {...props()} />);
      await type("Draft the proposal tomorrow 3pm ~45m #acme @calls !1 every week // ask Dana");
      expect(said()).toBe("Draft the proposal tomorrow 3pm ~45m #acme @calls !1 every week // ask Dana");
      for (const token of ["tomorrow", "3pm", "~45m", "@calls", "!1", "every week"]) expect(colourOf(token)).toBe(colours.light.ink2);
      expect(colourOf("#acme")).toBe(colours.light.meet);
      expect(colourOf("// ask Dana")).toBe(colours.light.ink3);
      // The title's own words are plain runs of the box: no colour of their own, so the box's ink.
      expect(within(box()).queryByText("Draft the proposal ")).toBeNull();
    });

    it("words turned back into title words lose their colour", async () => {
      await render(<QuickAddView {...props()} />);
      await type("Plan tomorrow ~30m");
      expect(colourOf("tomorrow")).toBe(colours.light.ink2);
      await press("Remove “Tomorrow”");
      expect(within(box()).queryByText("tomorrow")).toBeNull();
      expect(colourOf("~30m")).toBe(colours.light.ink2);
      expect(said()).toBe("Plan tomorrow ~30m");
    });
  });

  describe("a Backspace right after a token (PRODUCT_SPEC.md §5.1 rule 3)", () => {
    const key = (name: string) => fireEvent(box(), "keyPress", { nativeEvent: { key: name } });

    it("the first one turns the token back into words and deletes nothing; the next one deletes as usual", async () => {
      const p = props();
      await render(<QuickAddView {...p} />);
      await type("Plan tomorrow");
      expect(screen.getByRole("button", { name: "Remove “Tomorrow”" })).toBeTruthy();
      await key("Backspace");
      await type("Plan tomorro");
      expect(said()).toBe("Plan tomorrow");
      expect(screen.queryByRole("button", { name: "Remove “Tomorrow”" })).toBeNull();
      await key("Backspace");
      await type("Plan tomorro");
      expect(said()).toBe("Plan tomorro");
      await done();
      expect(submitted(p)[0].draft).toMatchObject({ title: "Plan tomorro", doDate: null });
    });

    it("a Backspace anywhere else just deletes", async () => {
      await render(<QuickAddView {...props()} />);
      await type("Plan tomorrow now");
      await key("Backspace");
      await type("Plan tomorrow no");
      expect(said()).toBe("Plan tomorrow no");
      expect(screen.getByRole("button", { name: "Remove “Tomorrow”" })).toBeTruthy();
    });
  });

  describe("a list pasted into the line (PRODUCT_SPEC.md §5.1 rule 6)", () => {
    const pasting = (text: string) =>
      act(async () => {
        await fireEvent.changeText(box(), text);
      });

    it("is one task per line, without its list markers, said once with one Undo that takes back exactly those", async () => {
      let n = 0;
      const takeBack = jest.fn(async () => undefined);
      const p = props({ onSubmit: jest.fn(async () => `task-${++n}`), onPasted: jest.fn(() => takeBack) });
      await render(<QuickAddView {...p} />);
      await pasting("- Buy milk\n* Call Dana tmr\n[ ] Pay rent\n\n1. Book the dentist\n");
      expect((p.onSubmit as jest.Mock).mock.calls.map((c) => c[0].draft.title)).toEqual(["Buy milk", "Call Dana", "Pay rent", "Book the dentist"]);
      expect(screen.getByText("4 tasks added")).toBeTruthy();
      // The box is left as it was: none of the list stays in it.
      expect(said()).toBe("");
      expect(p.onPasted).toHaveBeenCalledTimes(1);
      expect((p.onPasted as jest.Mock).mock.calls[0][0]).toEqual(["task-1", "task-2", "task-3", "task-4"]);
      await act(async () => {
        await press("Undo");
      });
      expect(takeBack).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Took back 4 tasks")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    });

    it("keeps the words already in the box, and files each line where the sheet was opened", async () => {
      const p = props({ here: { area: { id: "a1", name: "Home" } } });
      await render(<QuickAddView {...p} />);
      await type("Half a thought");
      await pasting("Half a thoughtBuy milk\nCall Dana #acme");
      expect(said()).toBe("Half a thought");
      expect(submitted(p, 0)).toMatchObject([{ draft: { title: "Buy milk" }, projectId: null }, { pageProject: false, areaId: "a1" }]);
      expect(submitted(p, 1)).toMatchObject([{ draft: { title: "Call Dana" }, projectId: "p1" }, { pageProject: false, areaId: null }]);
      expect(screen.getByText("2 tasks added")).toBeTruthy();
    });

    it("a line with no name is skipped and said so; a save that fails stops there, keeps that line, and says what was lost", async () => {
      const onSubmit = jest.fn().mockResolvedValueOnce("task-1").mockRejectedValueOnce(new Error("Your account is still loading — try again in a moment."));
      const p = props({ onSubmit, onPasted: jest.fn(() => jest.fn(async () => undefined)) });
      await render(<QuickAddView {...p} />);
      await pasting("Buy milk\ntomorrow ~30m\nCall Dana\nPay rent");
      expect(screen.getByText("Couldn't save “Call Dana”: Your account is still loading — try again in a moment. 1 line after it was not saved either.")).toBeTruthy();
      expect(screen.getByText("1 task added · 1 line with no name skipped")).toBeTruthy();
      expect(p.onPasted).toHaveBeenCalledWith(["task-1"]);
      expect(said()).toBe("Call Dana");
    });

    it("one line that came with a line break is not a list: it is typed in, on one line", async () => {
      const p = props();
      await render(<QuickAddView {...p} />);
      await pasting("Call the bank\n");
      expect(p.onSubmit).not.toHaveBeenCalled();
      expect(said()).toBe("Call the bank ");
      expect(screen.getByLabelText("Goes to Inbox")).toBeTruthy();
    });

    it("had the box kept the list, typing on is typing: the same lines are never added twice", async () => {
      let n = 0;
      const p = props({ onSubmit: jest.fn(async () => `task-${++n}`) });
      await render(<QuickAddView {...p} />);
      await pasting("Buy milk\nCall Dana");
      expect(p.onSubmit).toHaveBeenCalledTimes(2);
      // The box still holding the list, with one more letter typed after it.
      await pasting("Buy milk\nCall Danax");
      expect(p.onSubmit).toHaveBeenCalledTimes(2);
      expect(said()).toBe("Buy milk Call Danax");
      // A second list, pasted for real, is a paste.
      await type("");
      await pasting("Pay rent\nBook the dentist");
      expect(p.onSubmit).toHaveBeenCalledTimes(4);
    });
  });
});
