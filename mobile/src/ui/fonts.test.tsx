// Nothing is drawn until the typeface is in and this phone's kept theme, look and motion choice have been read, with
// that look's own faces: the first frame after a cold start is already in the person's look and its type, and so are
// the phone's own bars.
import { act, renderHook } from "@testing-library/react-native";
import * as SystemUI from "expo-system-ui";
import { useAppFonts } from "./fonts";
import { faceLook, resetLookFaces } from "./looks/face-loader";
import { LOOK_TOKENS } from "./looks/generated";
import { lookChoice, resetLookChoice } from "./looks/look-choice";
import { motionChoice, resetMotion } from "./motion";
import { resetThemeChoice, themeChoice } from "./theme-choice";

const mockKept = new Map<string, string>();
let mockAnswer: (() => void) | null = null;
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    // The device answers only when the test lets it, so "not read yet" can be looked at.
    getItem: jest.fn((key: string) => new Promise<string | null>((resolve) => void (mockAnswer = ((previous) => () => (previous?.(), resolve(mockKept.get(key) ?? null)))(mockAnswer)))),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));
let mockFonts: [boolean, Error | null] = [true, null];
jest.mock("expo-font", () => ({ useFonts: () => mockFonts, isLoaded: () => false, loadAsync: jest.fn(async () => undefined) }));
let mockFaces: { files: string[]; answer: () => void }[] = [];
jest.mock("expo-system-ui", () => ({ setBackgroundColorAsync: jest.fn(async () => undefined) }));
jest.mock("expo-status-bar", () => ({ StatusBar: Object.assign(() => null, { setStyle: jest.fn() }) }));

const background = jest.mocked(SystemUI.setBackgroundColorAsync);

beforeEach(() => {
  mockKept.clear();
  mockAnswer = null;
  mockFonts = [true, null];
  mockFaces = [];
  // A look's files are read only when the test lets them.
  resetLookFaces((files) => new Promise<void>((resolve) => void mockFaces.push({ files: Object.keys(files), answer: resolve })));
  resetThemeChoice();
  resetLookChoice();
  resetMotion();
  background.mockClear();
});

describe("useAppFonts", () => {
  it("holds the first frame until the phone's kept look, theme and motion are read, then draws in them", async () => {
    mockKept.set("sparehour.look", "tide");
    mockKept.set("sparehour.theme", "dark");
    mockKept.set("sparehour.motion", "reduce");
    const { result } = await renderHook(() => useAppFonts());
    expect(result.current).toBe(false);
    // The bars are not told Sky first.
    expect(background).not.toHaveBeenCalled();
    await act(async () => mockAnswer?.());
    // Read, but Tide's faces are not in yet: still the splash.
    expect(result.current).toBe(false);
    expect(mockFaces.map((f) => f.files)).toEqual([expect.arrayContaining(["Lexend_400Regular", "Lexend_600SemiBold"])]);
    await act(async () => mockFaces[0].answer());
    expect(result.current).toBe(true);
    expect(faceLook()).toBe("tide");
    expect([lookChoice(), themeChoice(), motionChoice()]).toEqual(["tide", "dark", "reduce"]);
    expect(background).toHaveBeenCalledWith(LOOK_TOKENS.tide.dark.colours.paper);
  });

  it("waits for the typeface too, and draws without it when it cannot be loaded", async () => {
    mockFonts = [false, null];
    const view = await renderHook(() => useAppFonts());
    await act(async () => mockAnswer?.());
    expect(view.result.current).toBe(false);
    mockFonts = [false, new Error("no font")];
    await act(async () => view.rerender({}));
    expect(view.result.current).toBe(true);
  });

  it("does not stay on the splash for a store that never answers", async () => {
    jest.useFakeTimers();
    try {
      const { result } = await renderHook(() => useAppFonts());
      expect(result.current).toBe(false);
      await act(async () => void jest.advanceTimersByTime(1600));
      expect(result.current).toBe(true);
      expect(lookChoice()).toBe("sky");
      expect(faceLook()).toBe("sky");
    } finally {
      jest.useRealTimers();
    }
  });
});
