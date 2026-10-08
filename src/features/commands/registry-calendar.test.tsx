// @vitest-environment jsdom
// The Calendar's modes (SCREENS.md §4, §24; DECISIONS.md "`Cmd+1/2/3` in a browser tab"): Cmd/Ctrl+1–3 and the
// palette's "Calendar: Day / Work week / Week" set the mode remembered on the device and open the Calendar. The keys
// are the Calendar's own, not the keyboard layer's every shell carries, and answer in the installed app only — in a
// browser tab they are left to the browser, which keeps them for its tabs — and the ? overlay says so.
import { fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_MODE_KEY, readCalendarMode, setCalendarMode, subscribeCalendarMode } from "@/features/calendar-view/calendar-mode";
import { useCalendarModeKeys } from "@/features/calendar-view/use-calendar-view";
import { chordMatches, chordOf, parseChord } from "./keys";
import { COMMANDS, availability, keyBindings } from "./registry";
import { ShortcutsDialog } from "./shortcuts-dialog";

const byId = (id: string) => {
  const c = COMMANDS.find((x) => x.id === id);
  if (!c) throw new Error(`no command ${id}`);
  return c;
};

function standalone(on: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (q: string) => ({ matches: on && q.includes("standalone"), media: q, addEventListener() {}, removeEventListener() {} }),
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => Reflect.deleteProperty(window, "matchMedia"));

describe("Calendar: Day · Work week · Week", () => {
  it("are mod+1, mod+2 and mod+3, titled for the palette under View", () => {
    expect(["calendar.day", "calendar.workweek", "calendar.week"].map((id) => [byId(id).shortcut, byId(id).title, byId(id).group])).toEqual([
      ["mod+1", "Calendar: Day", "View"],
      ["mod+2", "Calendar: Work week", "View"],
      ["mod+3", "Calendar: Week", "View"],
    ]);
    expect(chordMatches(chordOf({ key: "2", shiftKey: false, metaKey: true, ctrlKey: false, altKey: false }, true), parseChord("mod+2"))).toBe(true);
    expect(chordMatches(chordOf({ key: "2", shiftKey: false, metaKey: false, ctrlKey: true, altKey: false }, false), parseChord("mod+2"))).toBe(true);
  });

  it("set the remembered mode and open the Calendar; on the Calendar only the mode changes, and it hears", async () => {
    const go = vi.fn();
    const heard = vi.fn();
    const stop = subscribeCalendarMode(heard);
    await byId("calendar.day").run({ pathname: "/today", go } as never);
    expect(heard).toHaveBeenCalled();
    stop();
    expect(readCalendarMode()).toBe("day");
    expect(localStorage.getItem(CALENDAR_MODE_KEY)).toBe("day");
    expect(go).toHaveBeenCalledWith("/calendar");
    go.mockClear();
    await byId("calendar.workweek").run({ pathname: "/calendar", go } as never);
    expect(readCalendarMode()).toBe("workweek");
    expect(go).not.toHaveBeenCalled();
  });

  it("are always available from the palette, wherever you are", () => {
    expect(availability(byId("calendar.week"), { selectedTaskId: null, checkedTaskIds: [], pathname: "/inbox" })).toEqual({ enabled: true });
  });

  it("the keyboard layer every shell carries does not bind them", () => {
    expect(keyBindings().some((b) => b.shortcut.startsWith("mod+") && /^mod\+[123]$/.test(b.shortcut))).toBe(false);
  });

  it("on the Calendar the keys are left to the browser in a tab, and switch the mode in the installed app", () => {
    setCalendarMode("week");
    const { unmount } = renderHook(() => useCalendarModeKeys(true));
    standalone(false);
    expect(fireEvent.keyDown(window, { key: "1", ctrlKey: true })).toBe(true);
    expect(readCalendarMode()).toBe("week");
    standalone(true);
    expect(fireEvent.keyDown(window, { key: "1", ctrlKey: true })).toBe(false);
    expect(readCalendarMode()).toBe("day");
    fireEvent.keyDown(window, { key: "2", ctrlKey: true });
    expect(readCalendarMode()).toBe("workweek");
    // Not from a text field.
    const field = document.body.appendChild(document.createElement("input"));
    fireEvent.keyDown(field, { key: "3", ctrlKey: true });
    expect(readCalendarMode()).toBe("workweek");
    field.remove();
    unmount();
  });

  it("the ? overlay marks them as the installed app's", () => {
    render(<ShortcutsDialog isMac onClose={() => {}} />);
    // One row for the three, as SCREENS.md §24 has it.
    const row = screen.getByText("Calendar: day · work week · week").closest("div")!;
    expect(row).toHaveTextContent("In the installed app; a browser tab keeps these keys");
    expect(["⌘1", "⌘2", "⌘3"].map((k) => within(row).getByText(k))).toHaveLength(3);
  });
});
