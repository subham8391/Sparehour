// The look on screen: every colour a screen reads follows the look and the theme at once, a look's page is its sky
// or its flat paper, the phone's kept copy is what a cold start draws, and a look this build does not know is Sky.
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { LOOK_TOKENS } from "./looks/generated";
import { lookChoice, lookChoiceReady, resetLookChoice, setLookChoice } from "./looks/look-choice";
import { colours, corners, sky, useColours, useLook, useScheme, useShadows, useShape } from "./theme";
import { resetThemeChoice, setThemeChoice } from "./theme-choice";

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

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

function Drawn() {
  const c = useColours();
  const shape = useShape();
  const shadows = useShadows();
  const scheme = useScheme();
  return <Text>{[useLook(), scheme, c.paper, c.ink, c.spareFill, shape.radius.lg, shadows.btn ?? "no shadow", sky(scheme, "morning").join(">")].join(" | ")}</Text>;
}

beforeEach(() => {
  mockKept.clear();
  mockSystem = "light";
  resetThemeChoice();
  resetLookChoice();
});

describe("the look on screen", () => {
  it("starts as Sky, with the sky at this hour behind everything", async () => {
    await render(<Drawn />);
    await settle();
    expect(screen.getByText("sky | light | #e8f0fa | #0e2240 | #14b8a6 | 14 | no shadow | #cfe5ff>#e9f2fc>#fbf3e6")).toBeTruthy();
    expect(colours.light).toBe(LOOK_TOKENS.sky.light.colours);
  });

  it("changes every colour, the shape and the page the moment a look is chosen, and keeps it on the phone", async () => {
    await render(<Drawn />);
    await settle();
    await act(async () => setLookChoice("studio"));
    // Studio: white paper, flat (no sky), tighter corners, a hard shadow under the primary button.
    expect(screen.getByText("studio | light | #ffffff | #111111 | #19d48a | 12 | 3px 3px 0 #111111 | #ffffff>#ffffff>#ffffff")).toBeTruthy();
    await settle();
    expect(mockKept.get("sparehour.look")).toBe("studio");
    // Back to Sky: nothing is kept, as on the web.
    await act(async () => setLookChoice("sky"));
    await settle();
    expect(mockKept.has("sparehour.look")).toBe(false);
  });

  it("draws a look in dark when the theme says so, whichever way it is said", async () => {
    await render(<Drawn />);
    await settle();
    await act(async () => setLookChoice("daylight"));
    expect(screen.getByText(/^daylight \| light \| #f4f8f6 \| #161c19/)).toBeTruthy();
    await act(async () => setThemeChoice("dark"));
    expect(screen.getByText(/^daylight \| dark \| #0c110f \| #e8ecea/)).toBeTruthy();
  });

  it("follows the phone's own light or dark on System", async () => {
    mockSystem = "dark";
    await render(<Drawn />);
    await settle();
    expect(screen.getByText(/^sky \| dark \| #101b3a \| #f1f5ff .* #0a1430>#111d40>#1e1d47$/)).toBeTruthy();
  });

  it("is already in the kept look on the next launch, once the phone's copy is read", async () => {
    mockKept.set("sparehour.look", "indigo");
    await lookChoiceReady();
    expect(lookChoice()).toBe("indigo");
    await render(<Drawn />);
    expect(screen.getByText(/^indigo \| light \| #f7f8fa/)).toBeTruthy();
  });

  it("draws a look this build does not know as Sky, and keeps its name", async () => {
    await render(<Drawn />);
    await settle();
    await act(async () => setLookChoice("aurora"));
    expect(screen.getByText(/^aurora \| light \| #e8f0fa \| #0e2240/)).toBeTruthy();
    // Anything that is not a look's id at all is Sky, as on the web.
    await act(async () => setLookChoice("Not A Look!"));
    expect(lookChoice()).toBe("sky");
  });
});

describe("corners", () => {
  it("is one radius for most looks, four corners for an uneven shape", () => {
    expect(corners(14)).toEqual({ borderRadius: 14 });
    expect(corners([3, 7, 4, 8])).toEqual({ borderTopLeftRadius: 3, borderTopRightRadius: 7, borderBottomRightRadius: 4, borderBottomLeftRadius: 8 });
    expect(corners(["60%", "40%", "55%", "45%"])).toMatchObject({ borderTopLeftRadius: "60%", borderBottomLeftRadius: "45%" });
  });
});
