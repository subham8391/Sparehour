// The phone's own bars follow the look: the root view behind them takes the look's page colour, and the status bar's
// icons are light on a dark page, dark on a light one, whatever the theme is called.
import { act } from "@testing-library/react-native";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { resetThemeChoice, setThemeChoice } from "../theme-choice";
import { LOOK_TOKENS } from "./generated";
import { resetLookChoice, setLookChoice } from "./look-choice";
import { darkPage, pageNow, watchSystemBars } from "./system-bars";

jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn(async () => undefined) }));
jest.mock("expo-status-bar", () => ({ StatusBar: Object.assign(() => null, { setStyle: jest.fn() }) }));

const background = jest.mocked(SystemUI.setBackgroundColorAsync);
const style = jest.mocked(StatusBar.setStyle);

beforeEach(() => {
  jest.useFakeTimers();
  resetThemeChoice();
  resetLookChoice();
  background.mockClear();
  style.mockClear();
});
afterEach(() => jest.useRealTimers());

describe("darkPage", () => {
  it("tells a page that wants light icons from one that wants dark", () => {
    expect(darkPage("#e8f0fa")).toBe(false);
    expect(darkPage("#ffd84d")).toBe(false);
    expect(darkPage("#101b3a")).toBe(true);
    expect(darkPage("#0f3d6e")).toBe(true);
    expect(darkPage("transparent")).toBe(false);
  });

  it("finds the looks whose page is dark in the light theme, which the theme alone would get wrong", () => {
    const dark = Object.keys(LOOK_TOKENS).filter((id) => darkPage(LOOK_TOKENS[id].light.colours.paper));
    expect(dark.sort()).toEqual(["blueprint", "terminal"]);
    // In the dark theme every look's page is dark.
    expect(Object.keys(LOOK_TOKENS).every((id) => darkPage(LOOK_TOKENS[id].dark.colours.paper))).toBe(true);
  });
});

describe("watchSystemBars", () => {
  it("tells the phone the page as it opens, and again the moment the look or the theme changes", async () => {
    const stop = watchSystemBars();
    expect(background).toHaveBeenLastCalledWith("#e8f0fa");
    expect(style).toHaveBeenLastCalledWith("dark");
    await act(async () => setLookChoice("terminal"));
    expect(pageNow()).toBe(LOOK_TOKENS.terminal.light.colours.paper);
    expect(background).toHaveBeenLastCalledWith(LOOK_TOKENS.terminal.light.colours.paper);
    // A dark page in the light theme: light icons.
    expect(style).toHaveBeenLastCalledWith("light");
    await act(async () => setLookChoice("daylight"));
    expect(style).toHaveBeenLastCalledWith("dark");
    await act(async () => setThemeChoice("dark"));
    expect(background).toHaveBeenLastCalledWith("#0c110f");
    expect(style).toHaveBeenLastCalledWith("light");
    stop();
  });

  it("says it once more a moment later, after anything else that sets the status bar from the theme", async () => {
    const stop = watchSystemBars();
    await act(async () => setLookChoice("blueprint"));
    const told = style.mock.calls.length;
    jest.advanceTimersByTime(300);
    expect(style.mock.calls.length).toBe(told + 1);
    expect(style).toHaveBeenLastCalledWith("light");
    stop();
  });

  it("stops when told to", async () => {
    const stop = watchSystemBars();
    stop();
    background.mockClear();
    await act(async () => setLookChoice("studio"));
    jest.advanceTimersByTime(300);
    expect(background).not.toHaveBeenCalled();
  });
});
