// The review's host: it opens /review once at the start of a day when the web's rule says so, and never twice.
import { act, render } from "@testing-library/react-native";
import type { SyncChipState } from "@/features/shell/sync-chip-model";
import { CarryReviewHost } from "./carry-review-host";
import { markHandled, resetHandledDay, reviewOpened } from "./handled-day";
import type { CarriedPile } from "./use-carried";

const mockKept = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockKept.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => void mockKept.set(key, value)),
  },
}));

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
let mockPathname = "/";
let mockDay: string | undefined;
let mockNavigation: { key: string } | undefined = { key: "root" };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => ({ day: mockDay }),
  useRootNavigationState: () => mockNavigation,
}));

const TODAY = "2026-11-21";
let mockSettings: { carryReview: boolean } | null = { carryReview: true };
jest.mock("@/features/shell/use-local-day", () => ({
  useNow: () => ({}),
  useLocalDay: () => ({ today: jest.requireActual("@/core/time").localDate(TODAY), settings: mockSettings, zone: "UTC", ready: true }),
}));
let mockSync: SyncChipState = "synced";
jest.mock("../shutdown/use-sync-state", () => ({ useSyncState: () => mockSync }));
const pile = (over: Partial<CarriedPile> = {}): CarriedPile => ({ loaded: true, carried: [{ id: "t1" }, { id: "t2" }] as unknown as CarriedPile["carried"], user: { id: "u1", personal_space_id: "s1" }, todayPlan: null, yesterdayPlan: null, ...over });
let mockPile: CarriedPile = pile();
jest.mock("./use-carried", () => ({ useCarried: () => mockPile }));

/** Lets the store's read of the device land. */
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
/** One host at a time, as in the app: mounting again takes the last one down first. */
let last: { unmount: () => unknown } | null = null;
const mount = async () => {
  await last?.unmount();
  const view = await render(<CarryReviewHost />);
  last = view;
  await settle();
  return view;
};

beforeEach(() => {
  last = null;
  mockKept.clear();
  resetHandledDay();
  mockPush.mockClear();
  mockPathname = "/";
  mockDay = undefined;
  mockNavigation = { key: "root" };
  mockSettings = { carryReview: true };
  mockSync = "synced";
  mockPile = pile();
});

describe("<CarryReviewHost>", () => {
  it("opens the review on the day's first open when something was carried over", async () => {
    await mount();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/review");
  });

  it("opens it over whichever screen the app opened to, but never over a ritual", async () => {
    mockPathname = "/inbox";
    await mount();
    expect(mockPush).toHaveBeenCalledTimes(1);
    mockPush.mockClear();
    resetHandledDay();
    for (const ritual of ["/plan", "/shutdown"]) {
      mockPathname = ritual;
      await mount();
    }
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("stays shut when the review is off in Settings, or nothing was carried over", async () => {
    mockSettings = { carryReview: false };
    await mount();
    mockSettings = { carryReview: true };
    mockPile = pile({ carried: [] });
    await mount();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("waits for the settings, the rows and the first sync", async () => {
    mockSettings = null;
    await mount();
    mockSettings = { carryReview: true };
    mockPile = pile({ loaded: false });
    await mount();
    mockPile = pile();
    for (const state of ["connecting", "syncing"] as const) {
      mockSync = state;
      await mount();
    }
    expect(mockPush).not.toHaveBeenCalled();
    // The sync settles: now it asks.
    mockSync = "synced";
    await mount();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("never asks a person who reviewed or planned today, or closed yesterday with the shutdown", async () => {
    for (const over of [{ todayPlan: { carryReviewedAt: "2026-11-21T08:00:00Z", plannedAt: null } }, { todayPlan: { carryReviewedAt: null, plannedAt: "2026-11-21T08:00:00Z" } }, { yesterdayPlan: { shutdownAt: "2026-11-20T18:00:00Z" } }]) {
      mockPile = pile(over);
      await mount();
    }
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("asks once a day at most: not again once this phone has answered or dismissed today, even after the app is opened again", async () => {
    mockKept.set("sparehour:carry-review-handled", `u1:${TODAY}`);
    await mount();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("asks again on a new day, and asks the next account to sign in on this phone", async () => {
    mockKept.set("sparehour:carry-review-handled", "u1:2026-11-20");
    await mount();
    expect(mockPush).toHaveBeenCalledTimes(1);
    mockPush.mockClear();
    resetHandledDay();
    mockKept.set("sparehour:carry-review-handled", `u1:${TODAY}`);
    mockPile = pile({ user: { id: "u2", personal_space_id: "s2" } });
    await mount();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("does not open a second review while one is on screen, and stops asking once that one is answered", async () => {
    const view = await mount();
    expect(mockPush).toHaveBeenCalledTimes(1);
    // The review is up, and another screen is opened over it.
    let gone: () => void = () => undefined;
    await act(async () => void (gone = reviewOpened()));
    mockPathname = "/task/t1";
    await view.rerender(<CarryReviewHost />);
    expect(mockPush).toHaveBeenCalledTimes(1);
    await act(async () => {
      markHandled(`u1:${TODAY}`);
      gone();
    });
    mockPathname = "/";
    await view.rerender(<CarryReviewHost />);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("opens it again when the review was taken off the screen unanswered (the start gate moving to the screen the app opens to)", async () => {
    const view = await mount();
    let gone: () => void = () => undefined;
    await act(async () => void (gone = reviewOpened()));
    mockPathname = "/inbox";
    await act(async () => gone());
    await view.rerender(<CarryReviewHost />);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it("keeps the review for today itself while Today is stepped to another day", async () => {
    mockDay = "2026-11-25";
    const view = await mount();
    expect(mockPush).not.toHaveBeenCalled();
    mockDay = undefined;
    await view.rerender(<CarryReviewHost />);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("waits until the screens are mounted", async () => {
    mockNavigation = undefined;
    const view = await mount();
    expect(mockPush).not.toHaveBeenCalled();
    mockNavigation = { key: "root" };
    await view.rerender(<CarryReviewHost />);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});
