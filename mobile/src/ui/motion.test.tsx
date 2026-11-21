// Reduce motion: System follows the phone's own setting, Reduce cuts movement here whatever the phone says, and the
// choice is kept on the phone.
import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { Text } from "./text";
import { motionChoice, resetMotion, setMotionChoice, useReduceMotion } from "./motion";

const mockKept = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockKept.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => void mockKept.set(key, value)),
    removeItem: jest.fn(async (key: string) => void mockKept.delete(key)),
  },
}));

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
let phoneSays: ((on: boolean) => void) | null = null;

function Drawn() {
  return <Text>{useReduceMotion() ? "still" : "moving"}</Text>;
}

beforeEach(() => {
  mockKept.clear();
  resetMotion();
  phoneSays = null;
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((event: string, listener: (on: boolean) => void) => {
    if (event === "reduceMotionChanged") phoneSays = listener;
    return { remove: jest.fn() };
  }) as never);
});

describe("reduce motion", () => {
  it("moves on System while the phone does not mind", async () => {
    await render(<Drawn />);
    await settle();
    expect(motionChoice()).toBe("system");
    expect(screen.getByText("moving")).toBeTruthy();
  });

  it("follows the phone's own setting on System, as it is and as it changes", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    await render(<Drawn />);
    await settle();
    expect(screen.getByText("still")).toBeTruthy();
    await act(async () => phoneSays?.(false));
    expect(screen.getByText("moving")).toBeTruthy();
  });

  it("cuts movement at once on Reduce, whatever the phone says, and keeps the choice", async () => {
    await render(<Drawn />);
    await settle();
    await act(async () => setMotionChoice("reduce"));
    expect(screen.getByText("still")).toBeTruthy();
    await settle();
    expect(mockKept.get("sparehour.motion")).toBe("reduce");
    await act(async () => setMotionChoice("system"));
    await settle();
    expect(screen.getByText("moving")).toBeTruthy();
    expect(mockKept.has("sparehour.motion")).toBe(false);
  });

  it("is still on the next launch when Reduce was kept", async () => {
    mockKept.set("sparehour.motion", "reduce");
    await render(<Drawn />);
    await settle();
    expect(screen.getByText("still")).toBeTruthy();
  });
});
