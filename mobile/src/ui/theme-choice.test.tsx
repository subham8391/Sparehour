// This phone's theme: System follows the phone, Light and Dark hold, and the choice is kept on the device.
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { useScheme } from "./theme";
import { resetThemeChoice, setThemeChoice, themeChoice } from "./theme-choice";

const mockKept = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockKept.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => void mockKept.set(key, value)),
    removeItem: jest.fn(async (key: string) => void mockKept.delete(key)),
  },
}));
let mockSystem: "light" | "dark" = "light";
jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({ __esModule: true, default: () => mockSystem }));

/** Lets the store's read of the device, and a write to it, land. */
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

function Drawn() {
  return <Text>{useScheme()}</Text>;
}

beforeEach(() => {
  mockKept.clear();
  mockSystem = "light";
  resetThemeChoice();
});

describe("the phone's theme", () => {
  it("follows the phone on System, which is where it starts", async () => {
    mockSystem = "dark";
    await render(<Drawn />);
    await settle();
    expect(themeChoice()).toBe("system");
    expect(screen.getByText("dark")).toBeTruthy();
  });

  it("holds Light or Dark whatever the phone says, at once, and keeps it on the device", async () => {
    await render(<Drawn />);
    await settle();
    await act(async () => setThemeChoice("dark"));
    expect(screen.getByText("dark")).toBeTruthy();
    await settle();
    expect(mockKept.get("sparehour.theme")).toBe("dark");
    // Back to System: the kept choice goes, and the phone decides again.
    await act(async () => setThemeChoice("system"));
    await settle();
    expect(mockKept.has("sparehour.theme")).toBe(false);
    expect(screen.getByText("light")).toBeTruthy();
  });

  it("draws the kept choice on the next launch", async () => {
    mockKept.set("sparehour.theme", "dark");
    await render(<Drawn />);
    await settle();
    expect(themeChoice()).toBe("dark");
    expect(screen.getByText("dark")).toBeTruthy();
  });

  it("takes anything else that was kept for System", async () => {
    mockKept.set("sparehour.theme", "sepia");
    await render(<Drawn />);
    await settle();
    expect(themeChoice()).toBe("system");
  });
});
