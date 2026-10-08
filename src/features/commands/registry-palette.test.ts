// @vitest-environment jsdom
// The palette's coverage of SCREENS.md §12 (P37): every M1 command is there with words to find it by; the ones only
// the palette lists live in its own island (palette-runs.ts), not the keyboard layer every shell carries; the new
// ones — Add task to Inbox, Add tag, Add time block, Clear the slate, Sync now, Export data, Sign out — run the same
// code as their buttons; Sign out asks first, in the palette, with Settings' unsynced warning.
import { afterEach, describe, expect, it, vi } from "vitest";
import { instant, localDate } from "@/core/time";
import type { LocalDatabase } from "@/data/powersync";
import type { TaskRepo } from "@/data/repositories/task-repo";
import { onAddBlock, resetAddBlock } from "@/features/blocking/add-block-request";
import { registerTodayHandler, resetTodayRequests } from "@/features/today/today-request";
import { RUNS } from "./command-runs";
import { PALETTE_RUNS, addTag, tagFromQuery, type PaletteContext } from "./palette-runs";
import { COMMANDS, availability, keyBindings, type CommandContext } from "./registry";

const signOutDevice = vi.fn(async (_db: unknown, _anyway?: boolean) => 0);
vi.mock("@/features/account/sign-out", async (load) => ({ ...(await load<typeof import("@/features/account/sign-out")>()), signOutDevice: (db: unknown, anyway?: boolean) => signOutDevice(db, anyway) }));
const syncEverything = vi.fn(async (_calendar: boolean) => ({ ok: true, message: "Synced." }));
vi.mock("@/features/shell/sync-everything", () => ({ syncEverything: (calendar: boolean) => syncEverything(calendar) }));

const byId = (id: string) => {
  const c = COMMANDS.find((x) => x.id === id);
  if (!c) throw new Error(`no command ${id}`);
  return c;
};

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  return {
    selectedTaskId: null,
    checkedTaskIds: [],
    toggleCheck: vi.fn(),
    checkAll: vi.fn(),
    clearChecks: vi.fn(),
    pathname: "/inbox",
    today: localDate("2026-10-08"),
    now: instant("2026-10-08T08:00:00Z"),
    zone: "UTC",
    tasks: {} as TaskRepo,
    go: vi.fn(),
    quickAdd: vi.fn(),
    openTask: vi.fn(),
    editTicked: vi.fn(),
    moveSelection: vi.fn(),
    openPalette: vi.fn(),
    openShortcuts: vi.fn(),
    setTheme: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canRedo: false,
    blockTask: vi.fn(),
    planDay: vi.fn(),
    taskState: vi.fn(async () => "active"),
    projectName: vi.fn(async () => null),
    ...over,
  };
}

/** A local database that answers the few reads the palette's own commands make. */
function fakeDb(answers: { queued?: number; calendars?: number; space?: string | null } = {}) {
  return {
    getUploadQueueStats: vi.fn(async () => ({ count: answers.queued ?? 0 })),
    getOptional: vi.fn(async (sql: string) => {
      if (sql.includes("calendar_connections")) return { n: answers.calendars ?? 0 };
      if (sql.includes("personal_space_id")) return { personal_space_id: answers.space === undefined ? "s1" : answers.space };
      return null;
    }),
    writeTransaction: vi.fn(),
  } as unknown as LocalDatabase;
}

const inPalette = (db: LocalDatabase, over: Partial<CommandContext> = {}): PaletteContext => ({ ...ctx(over), db, history: null });

afterEach(() => {
  resetTodayRequests();
  resetAddBlock();
  signOutDevice.mockClear();
  syncEverything.mockClear();
  window.history.replaceState(null, "", "/");
});

describe("SCREENS.md §12's command list, M1", () => {
  // Each §12 entry as the palette names it. "Set priority" is the four Priority rows; "a project" and "an area" are
  // the pickers; "Start focus" and the M2 row wait for M2.
  const LIST: Record<string, string[]> = {
    Create: ["Add task", "Add task to Inbox", "Add project", "Add area", "Add tag…", "Add time block"],
    "Go to": ["Go to Today", "Go to Inbox", "Go to Upcoming", "Go to Calendar", "Go to Someday", "Go to Logbook", "Settings", "Go to project…", "Go to area…", "Search"],
    Day: ["Start morning plan", "Start evening shutdown", "Plan my day", "Re-plan the rest of today", "Trim today…", "Clear the slate…", "Go to tomorrow", "Go to yesterday", "Jump to date…"],
    "Selected task": [
      "Complete",
      "Un-complete",
      "Move to Today",
      "Tomorrow",
      "This evening",
      "This weekend",
      "In 4 hours",
      "Next week",
      "Pick a date",
      "Set deadline",
      "Set start date",
      "Set estimate",
      "Priority 1",
      "Move to project",
      "Add tag",
      "Move to Someday",
      "Drop",
      "Duplicate",
      "Convert to project",
      "Block it",
      "Copy link",
    ],
    View: ["Toggle sidebar", "Toggle timeline", "Show completed", "Sort by…", "Zoom timeline in", "Zoom timeline out", "Light theme", "Dark theme", "Follow the system theme"],
    App: ["Undo", "Redo", "Sync now", "Export data", "Keyboard shortcuts", "Connect calendar", "Settings", "Sign out"],
  };

  it("has every command, findable, with words to find it by", () => {
    const listed = COMMANDS.filter((c) => !c.hidden);
    for (const [group, titles] of Object.entries(LIST)) {
      for (const title of titles) {
        const c = listed.find((x) => x.title === title);
        expect(c, `${group}: ${title}`).toBeDefined();
      }
    }
    // Words beyond the title for everything a person might look for by another name.
    const bare = listed.filter((c) => !c.keywords && !/^(Go to |Sort Today by |Priority |Calendar: )/.test(c.title) && !["Settings", "Complete", "Open", "Tomorrow", "This evening", "This weekend", "In 4 hours", "Next week", "Move to Today", "Move to Someday", "Drop", "Undo", "Search", "Keyboard shortcuts", "No priority"].includes(c.title));
    expect(bare.map((c) => c.title)).toEqual([]);
  });

  it("gives the Day group the rituals, the plans, Trim, Clear the slate and the day steps", () => {
    expect(COMMANDS.filter((c) => c.group === "Day").map((c) => c.title)).toEqual(expect.arrayContaining(LIST.Day));
  });

  it("keeps the palette's own commands out of the keyboard layer every shell carries", () => {
    expect(RUNS.filter((r) => !r.shortcut).map((r) => r.id)).toEqual([]);
    expect(PALETTE_RUNS.filter((r) => r.shortcut).map((r) => r.id)).toEqual([]);
    // …and the keys still all bind.
    expect(keyBindings(RUNS)).toHaveLength(RUNS.length);
    expect(new Set(COMMANDS.map((c) => c.id)).size).toBe(COMMANDS.length);
    expect(COMMANDS.filter((c) => !c.title).map((c) => c.id)).toEqual([]);
  });
});

describe("Block it off a day that places blocks", () => {
  it("is listed off with the reason; where a timeline answers it runs", () => {
    const one = { selectedTaskId: "t1", checkedTaskIds: [] as string[] };
    expect(availability(byId("task.block"), { ...one, canBlock: false })).toEqual({ enabled: false, reason: "where a timeline is shown" });
    expect(availability(byId("task.block"), { ...one, canBlock: true })).toEqual({ enabled: true });
    expect(availability(byId("task.block"), { selectedTaskId: null, checkedTaskIds: [], canBlock: true })).toEqual({ enabled: false, reason: "select a task first" });
  });
});

describe("the new Create commands", () => {
  it("Add task to Inbox opens quick add with nothing filled in, which files to the Inbox", () => {
    const c = ctx({ pathname: "/today" });
    void byId("create.inbox").run(c);
    expect(c.quickAdd).toHaveBeenCalledWith();
  });

  it("Add tag… waits for the name, then 'Add tag \"calls\"' makes it", async () => {
    expect(byId("create.tag").fill).toBe("Add tag ");
    expect(tagFromQuery("Add tag calls")).toBe("calls");
    expect(tagFromQuery("new tag @Deep work ")).toBe("Deep work");
    expect(tagFromQuery("Add tag ")).toBeNull();
    expect(tagFromQuery("add task tag")).toBeNull();
  });

  it("a tag that exists already is said, not made twice; no account yet is said too", async () => {
    const taken = fakeDb();
    (taken.writeTransaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ getOptional: async () => ({ id: "g1", name: "calls" }), execute: vi.fn() }),
    );
    expect(await addTag({ db: taken, history: null }, "Calls")).toMatchObject({ text: "@calls is already a tag." });
    const made = fakeDb();
    const execute = vi.fn();
    (made.writeTransaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ getOptional: async () => null, execute }));
    const history = { record: vi.fn() };
    expect(await addTag({ db: made, history }, "calls")).toBeNull();
    expect(execute.mock.calls[0][0]).toMatch(/^insert into tags/);
    expect(history.record).toHaveBeenCalledWith(expect.objectContaining({ label: "Added tag @calls", toast: true }));
    expect(await addTag({ db: fakeDb({ space: null }), history: null }, "calls")).toMatchObject({ text: expect.stringMatching(/still loading/) });
  });

  it("Add time block places it on today's timeline, or goes to Today and places it there", () => {
    const placed = vi.fn();
    // Elsewhere: Today first, and the block once today's timeline is open.
    const away = ctx({ pathname: "/inbox" });
    void byId("create.block").run(away);
    expect(away.go).toHaveBeenCalledWith("/today");
    onAddBlock(placed);
    expect(placed).toHaveBeenCalledTimes(1);
    // On Today showing today: at once.
    const here = ctx({ pathname: "/today" });
    void byId("create.block").run(here);
    expect(here.go).not.toHaveBeenCalled();
    expect(placed).toHaveBeenCalledTimes(2);
    // Today stepped to another day comes home first.
    window.history.replaceState(null, "", "/today?day=2026-10-09");
    const stepped = ctx({ pathname: "/today" });
    void byId("create.block").run(stepped);
    expect(stepped.go).toHaveBeenCalledWith("/today");
  });
});

describe("the new Day and App commands", () => {
  it("Clear the slate opens Today's own confirmation, at once or once Today is open", () => {
    const away = ctx({ pathname: "/inbox" });
    void byId("day.clear-slate").run(away);
    expect(away.go).toHaveBeenCalledWith("/today");
    const handler = vi.fn();
    registerTodayHandler(handler);
    expect(handler).toHaveBeenCalledWith({ kind: "slate" });
    const here = ctx({ pathname: "/today" });
    void byId("day.clear-slate").run(here);
    expect(here.go).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("Export data lands on Settings › Data; on Settings the section changes in place", () => {
    const away = ctx({ pathname: "/today" });
    void byId("app.export").run(away);
    expect(away.go).toHaveBeenCalledWith("/settings#data");
    window.history.replaceState(null, "", "/settings#notifications");
    const there = ctx({ pathname: "/settings" });
    void byId("app.export").run(there);
    expect(there.go).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#data");
  });

  it("Sync now runs the sync chip's path, the calendar too when one is connected, and says how it went", async () => {
    expect(byId("app.sync").working).toBe("Syncing…");
    expect(await byId("app.sync").step!(inPalette(fakeDb({ calendars: 1 })))).toMatchObject({ text: "Synced.", status: true });
    expect(syncEverything).toHaveBeenLastCalledWith(true);
    await byId("app.sync").step!(inPalette(fakeDb({ calendars: 0 })));
    expect(syncEverything).toHaveBeenLastCalledWith(false);
  });

  it("Sign out asks first, inside the palette, and signs out on yes", async () => {
    const db = fakeDb();
    const step = await byId("app.signout").step!(inPalette(db));
    expect(step).toMatchObject({ text: "Sign out of Sparehour on this device?", note: "Signing out removes your data from this device. It stays safe in your account." });
    expect(step!.actions.map((a) => a.label)).toEqual(["Sign out", "Stay signed in"]);
    expect(signOutDevice).not.toHaveBeenCalled();
    // "Stay signed in" has nothing to run: the palette just closes.
    expect(step!.actions[1].run).toBeUndefined();
    expect(await step!.actions[0].run!()).toBeNull();
    expect(signOutDevice).toHaveBeenCalledWith(db, false);
  });

  it("with changes still waiting, Sign out gives Settings' warning, and only 'Sign out and lose them' goes ahead", async () => {
    const db = fakeDb({ queued: 2 });
    const step = await byId("app.signout").step!(inPalette(db));
    expect(step).toMatchObject({ text: "2 changes haven’t reached your account yet. Signing out now loses them.", note: "Once you’re back online it syncs by itself, then signing out is safe." });
    expect(step!.actions.map((a) => [a.label, a.tone])).toEqual([
      ["Stay signed in", undefined],
      ["Sign out and lose them", "destructive"],
    ]);
    await step!.actions[1].run!();
    expect(signOutDevice).toHaveBeenCalledWith(db, true);
  });

  it("a change that arrives while it asks still stops the sign-out with the warning", async () => {
    signOutDevice.mockResolvedValueOnce(1);
    const step = await byId("app.signout").step!(inPalette(fakeDb()));
    expect(await step!.actions[0].run!()).toMatchObject({ text: "1 change hasn’t reached your account yet. Signing out now loses it.", actions: [{ label: "Stay signed in" }, { label: "Sign out and lose it" }] });
  });
});
