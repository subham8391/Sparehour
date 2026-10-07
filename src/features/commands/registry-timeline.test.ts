// The timeline's commands (SCREENS.md §2.6, §12, §24; DECISIONS.md "`M` on the timeline", "Timeline zoom"):
// + and - zoom, and the selected block's Move to…, Duplicate and Rename, which have no single key.
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerTimeline } from "@/features/today/timeline-request";
import { chordMatches, chordOf, parseChord } from "./keys";
import { COMMANDS, availability, keyBindings } from "./registry";

const byId = (id: string) => {
  const c = COMMANDS.find((x) => x.id === id);
  if (!c) throw new Error(`no command ${id}`);
  return c;
};
const none = { selectedTaskId: null, checkedTaskIds: [] as string[], pathname: "/today" };

let release: (() => void) | null = null;
afterEach(() => {
  release?.();
  release = null;
});

describe("timeline commands", () => {
  it("+ and - are bound, read as keys of their own, and match the keys a keyboard sends", () => {
    expect(byId("view.zoom-in").shortcut).toBe("+");
    expect(byId("view.zoom-out").shortcut).toBe("-");
    expect(parseChord("+")).toEqual({ key: "+", shift: false, mod: false, alt: false });
    expect(parseChord("mod++").key).toBe("+");
    // "+" arrives shifted on most keyboards: shift does not matter for punctuation.
    expect(chordMatches(chordOf({ key: "+", shiftKey: true, metaKey: false, ctrlKey: false, altKey: false }, true), parseChord("+"))).toBe(true);
    expect(keyBindings(COMMANDS).filter((b) => b.shortcut === "+" || b.shortcut === "-")).toHaveLength(2);
  });

  it("with no timeline on screen they are listed but off, and the keys pass on as typing", () => {
    expect(availability(byId("view.zoom-in"), none)).toEqual({ enabled: false, reason: "where a timeline is shown" });
    expect(byId("view.zoom-in").passes?.({} as never)).toBe(true);
    expect(availability(byId("block.move"), none)).toEqual({ enabled: false, reason: "where a timeline is shown" });
  });

  it("with a timeline they run there; the block commands need a selected block, and take no task selection", () => {
    const run = vi.fn();
    let hasBlock = false;
    release = registerTimeline({ run, hasBlock: () => hasBlock });
    expect(availability(byId("view.zoom-out"), none)).toEqual({ enabled: true });
    expect(byId("view.zoom-out").passes?.({} as never)).toBe(false);
    void byId("view.zoom-out").run({} as never);
    expect(run).toHaveBeenCalledWith("zoom-out");
    for (const id of ["block.move", "block.duplicate", "block.rename"]) {
      expect(byId(id).shortcut).toBeUndefined();
      expect(availability(byId(id), none)).toEqual({ enabled: false, reason: "select a block first" });
    }
    hasBlock = true;
    expect(availability(byId("block.duplicate"), none)).toEqual({ enabled: true });
    void byId("block.move").run({} as never);
    expect(run).toHaveBeenLastCalledWith("move-block");
    expect(byId("block.move").title).toBe("Move block to…");
    expect(byId("view.zoom-in").title).toBe("Zoom timeline in");
  });
});
