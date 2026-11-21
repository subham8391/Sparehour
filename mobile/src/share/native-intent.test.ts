// The address the app is opened with, carried out: what was shared is read once and cleared, and quick add is asked
// for through its waiting room, to be answered when the sheet's provider is up.
import { takeQuickAddAsk } from "~/screens/quick-add/ask";
import { redirectSystemPath } from "./native-intent";

const mockShared = jest.fn((): { value: string; shareType: string }[] => []);
const mockClear = jest.fn();
jest.mock("expo-sharing", () => ({ getSharedPayloads: () => mockShared(), clearSharedPayloads: () => mockClear() }));

beforeEach(() => {
  jest.clearAllMocks();
  takeQuickAddAsk();
});

describe("redirectSystemPath", () => {
  it("a share opens the Inbox, asks for quick add holding the line, and is cleared so it is offered once", () => {
    mockShared.mockReturnValueOnce([{ value: "Watch this one — https://youtu.be/abc123", shareType: "text" }]);
    expect(redirectSystemPath({ path: "sparehour://expo-sharing", initial: true })).toBe("/inbox");
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(takeQuickAddAsk()).toEqual({ text: "Watch this one // https://youtu.be/abc123" });
    expect(takeQuickAddAsk()).toBeNull();
  });

  it("a share with nothing in it, or one that cannot be read, opens the page that says so", () => {
    expect(redirectSystemPath({ path: "sparehour://expo-sharing", initial: false })).toBe("/share");
    mockShared.mockImplementationOnce(() => {
      throw new Error("no module");
    });
    expect(redirectSystemPath({ path: "sparehour://expo-sharing", initial: true })).toBe("/share");
    expect(takeQuickAddAsk()).toBeNull();
  });

  it("the Add a task shortcut opens Today and asks for an empty sheet; Today's opens Today alone", () => {
    expect(redirectSystemPath({ path: "sparehour://today?quickadd=1", initial: true })).toBe("/");
    expect(takeQuickAddAsk()).toEqual({});
    expect(redirectSystemPath({ path: "sparehour://today", initial: true })).toBe("/");
    expect(takeQuickAddAsk()).toBeNull();
  });

  it("the app's own addresses pass through, and nothing shared is touched", () => {
    expect(redirectSystemPath({ path: "sparehour://task/abc", initial: false })).toBe("sparehour://task/abc");
    expect(redirectSystemPath({ path: "sparehour:///", initial: true })).toBe("sparehour:///");
    expect(mockShared).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
    expect(takeQuickAddAsk()).toBeNull();
  });
});
