// The theme and the look follow the account: the phone's copy catches up with the settings row when it arrives, and
// again when another device changes it; an empty row changes nothing.
import { act, render } from "@testing-library/react-native";
import { themeChoice, resetThemeChoice, setThemeChoice } from "../theme-choice";
import { AccountLook } from "./account-look";
import { lookChoice, resetLookChoice, setLookChoice } from "./look-choice";

let mockRows: Record<string, unknown>[] | undefined;
jest.mock("@/data/powersync", () => ({ useQuery: () => ({ data: mockRows }) }));

beforeEach(() => {
  mockRows = undefined;
  resetThemeChoice();
  resetLookChoice();
});

describe("<AccountLook>", () => {
  it("leaves the phone's copy alone until the settings row is here", async () => {
    setLookChoice("indigo");
    setThemeChoice("dark");
    await render(<AccountLook />);
    expect(lookChoice()).toBe("indigo");
    expect(themeChoice()).toBe("dark");
  });

  it("brings the phone's copy up to the account's, and follows a change made on another device", async () => {
    mockRows = [{ id: "s1", theme: "dark", look: "tide" }];
    const view = await render(<AccountLook />);
    expect(themeChoice()).toBe("dark");
    expect(lookChoice()).toBe("tide");
    mockRows = [{ id: "s1", theme: "light", look: "studio" }];
    await act(async () => view.rerender(<AccountLook />));
    expect(themeChoice()).toBe("light");
    expect(lookChoice()).toBe("studio");
  });

  it("reads an empty or unknown theme as System and anything that is not a look as Sky, as the web does", async () => {
    setLookChoice("tide");
    setThemeChoice("dark");
    mockRows = [{ id: "s1", theme: null, look: "Not A Look!" }];
    await render(<AccountLook />);
    expect(themeChoice()).toBe("system");
    expect(lookChoice()).toBe("sky");
  });

  it("does not undo a choice just made here while the row still says the old one", async () => {
    mockRows = [{ id: "s1", theme: "light", look: "sky" }];
    const view = await render(<AccountLook />);
    // Settings shows the new look at once and writes the row; the query trails by a moment.
    await act(async () => setLookChoice("garden"));
    await act(async () => view.rerender(<AccountLook />));
    expect(lookChoice()).toBe("garden");
  });
});
