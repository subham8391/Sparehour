// The phone's memory of the day the review was answered or dismissed: read once from the device, kept for the next
// launch, per account; and the count of review screens that are open.
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { handledToken, markHandled, resetHandledDay, reviewOpened, useHandledDay } from "./handled-day";

const mockKept = new Map<string, string>();
/** While set, the phone's storage does not answer until it resolves. */
let mockHold: Promise<void> | null = null;
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => {
      if (mockHold) await mockHold;
      return mockKept.get(key) ?? null;
    }),
    setItem: jest.fn(async (key: string, value: string) => void mockKept.set(key, value)),
  },
}));

const KEY = "sparehour:carry-review-handled";
/** Lets the store's read of the device, and a write to it, land. */
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

function Drawn() {
  const h = useHandledDay();
  return <Text>{`${h.loaded ? "read" : "reading"} | ${h.token ?? "none"} | ${h.open}`}</Text>;
}

beforeEach(() => {
  mockKept.clear();
  mockHold = null;
  resetHandledDay();
});

describe("the handled day", () => {
  it("names an account's day in one word", () => {
    expect(handledToken("u1", "2026-11-21")).toBe("u1:2026-11-21");
    expect(handledToken(undefined, "2026-11-21")).toBe(":2026-11-21");
  });

  it("is not known until the phone has been read, then says what was kept", async () => {
    mockKept.set(KEY, "u1:2026-11-20");
    let answer: () => void = () => undefined;
    mockHold = new Promise((resolve) => (answer = resolve));
    await render(<Drawn />);
    expect(screen.getByText("reading | none | 0")).toBeTruthy();
    answer();
    await settle();
    expect(screen.getByText("read | u1:2026-11-20 | 0")).toBeTruthy();
  });

  it("with nothing kept, reads as no day handled", async () => {
    await render(<Drawn />);
    await settle();
    expect(screen.getByText("read | none | 0")).toBeTruthy();
  });

  it("a day marked shows at once and is kept for the next launch", async () => {
    await render(<Drawn />);
    await settle();
    await act(async () => markHandled("u1:2026-11-21"));
    expect(screen.getByText("read | u1:2026-11-21 | 0")).toBeTruthy();
    expect(mockKept.get(KEY)).toBe("u1:2026-11-21");
  });

  it("a day marked before the phone answers stands over what was kept", async () => {
    mockKept.set(KEY, "u1:2026-11-20");
    let answer: () => void = () => undefined;
    mockHold = new Promise((resolve) => (answer = resolve));
    await render(<Drawn />);
    await act(async () => markHandled("u1:2026-11-21"));
    answer();
    await settle();
    expect(screen.getByText("read | u1:2026-11-21 | 0")).toBeTruthy();
  });

  it("counts the review screens that are open, each leaving once", async () => {
    await render(<Drawn />);
    await settle();
    let gone: () => void = () => undefined;
    await act(async () => void (gone = reviewOpened()));
    expect(screen.getByText("read | none | 1")).toBeTruthy();
    await act(async () => {
      gone();
      gone();
    });
    expect(screen.getByText("read | none | 0")).toBeTruthy();
  });
});
