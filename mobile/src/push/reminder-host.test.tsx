// The reminders' host: shown while the app is open, one category per kind with the web's buttons, the launch
// re-registration, and a tapped reminder carried out as the web's push-actions.tsx does — each button's action at
// once, a plain tap the same action sheet — once per tap.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { actionsFor } from "@/features/notifications/actions";
import { ReminderHost, SHOW_WHILE_OPEN } from "./reminder-host";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockRouter = { push: jest.fn(), navigate: jest.fn() };
let mockNavigation: { key: string } | undefined = { key: "root" };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useRootNavigationState: () => mockNavigation }));

type Response = { actionIdentifier: string; notification: { request: { identifier: string; content: { data: Record<string, unknown> } } } };
let mockResponse: Response | null | undefined = null;
jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(async () => null),
  useLastNotificationResponse: () => mockResponse,
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  dismissNotificationAsync: jest.fn(async () => undefined),
}));
jest.mock("./device", () => ({ registerAgain: jest.fn(async () => undefined) }));

const mockDb = { getOptional: jest.fn(async (..._args: unknown[]): Promise<unknown> => ({ start_at: "2026-11-22T09:00:00.000Z", end_at: "2026-11-22T10:00:00.000Z" })) };
jest.mock("@/data/powersync", () => ({ useLocalDatabase: () => mockDb }));
const mockTasks = { update: jest.fn(async (..._args: unknown[]) => undefined) };
jest.mock("@/features/tasks/use-task-repo", () => ({ useTaskRepo: () => mockTasks }));
const mockBlocks = { move: jest.fn(async (..._args: unknown[]) => undefined) };
jest.mock("@/features/blocking/use-block-repo", () => ({ useBlockRepo: () => mockBlocks }));
let mockReady = true;
jest.mock("@/features/shell/use-local-day", () => ({
  useNow: () => ({}),
  useLocalDay: () => ({ today: jest.requireActual("@/core/time").localDate("2026-11-22"), settings: null, zone: "Europe/London", ready: mockReady }),
}));

const Notifications = jest.requireMock("expo-notifications");
const device = jest.requireMock("./device");
const PLAIN = "expo.modules.notifications.actions.DEFAULT";
let serial = 0;
const respond = (navigate: string, actionIdentifier = PLAIN): Response => ({ actionIdentifier, notification: { request: { identifier: `n${++serial}`, content: { data: { navigate } } } } });
const BLOCK = "/today?src=push&kind=block_start&task=t1&block=b1";
const EVE = "/today?src=push&kind=deadline_eve&task=t1";

beforeEach(() => {
  jest.clearAllMocks();
  mockResponse = null;
  mockNavigation = { key: "root" };
  mockReady = true;
});

describe("<ReminderHost>", () => {
  it("shows a reminder while the app is open, with its sound unless it came silent", async () => {
    await render(<ReminderHost />);
    expect(Notifications.setNotificationHandler).toHaveBeenCalledWith(SHOW_WHILE_OPEN);
    const behave = (sound: string | null) => SHOW_WHILE_OPEN.handleNotification({ request: { content: { sound } } } as never);
    expect(await behave("default")).toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true });
    expect(await behave(null)).toMatchObject({ shouldPlaySound: false });
  });

  it("registers one category per kind, its buttons the web's actionsFor, each opening the app", async () => {
    await render(<ReminderHost />);
    const kinds = ["block_start", "deadline_eve", "deadline_day", "morning", "shutdown"] as const;
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledTimes(kinds.length);
    for (const kind of kinds)
      expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
        kind,
        actionsFor(kind).map((a) => ({ identifier: a.id, buttonTitle: a.label, options: { opensAppToForeground: true } })),
      );
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith("block_start", [
      { identifier: "start", buttonTitle: "Start", options: { opensAppToForeground: true } },
      { identifier: "snooze", buttonTitle: "Snooze 15m", options: { opensAppToForeground: true } },
      { identifier: "plan", buttonTitle: "Plan", options: { opensAppToForeground: true } },
    ]);
  });

  it("hands this device's token over again at launch", async () => {
    await render(<ReminderHost />);
    expect(device.registerAgain).toHaveBeenCalledTimes(1);
  });

  it("Start opens the task, on Today", async () => {
    mockResponse = respond(BLOCK, "start");
    await render(<ReminderHost />);
    expect(mockRouter.navigate).toHaveBeenCalledWith("/");
    expect(mockRouter.push).toHaveBeenCalledWith("/task/t1");
    expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(`n${serial}`);
  });

  it("Snooze 15m moves the block fifteen minutes", async () => {
    mockResponse = respond(BLOCK, "snooze");
    await render(<ReminderHost />);
    await act(async () => undefined);
    expect(mockDb.getOptional).toHaveBeenCalledWith(expect.stringContaining("from time_blocks"), ["b1"]);
    expect(mockBlocks.move).toHaveBeenCalledWith("b1", "2026-11-22T09:15:00.000Z", "2026-11-22T10:15:00.000Z");
  });

  it("Today and Tomorrow move the task, untimed and out of the evening, with the web's undo words", async () => {
    mockResponse = respond(EVE, "today");
    const view = await render(<ReminderHost />);
    await act(async () => undefined);
    expect(mockTasks.update).toHaveBeenLastCalledWith("t1", { doDate: expect.objectContaining({ day: 22 }), doTime: null, evening: false }, "Moved {title} to today");
    mockResponse = respond(EVE, "tomorrow");
    await view.rerender(<ReminderHost />);
    await act(async () => undefined);
    expect(mockTasks.update).toHaveBeenLastCalledWith("t1", { doDate: expect.objectContaining({ day: 23 }), doTime: null, evening: false }, "Moved {title} to tomorrow");
  });

  it("Plan and Shutdown open those screens; Not today only opens the reminder's page", async () => {
    mockResponse = respond(BLOCK, "plan");
    const view = await render(<ReminderHost />);
    expect(mockRouter.push).toHaveBeenLastCalledWith("/plan");
    mockResponse = respond("/shutdown?src=push&kind=shutdown", "shutdown");
    await view.rerender(<ReminderHost />);
    expect(mockRouter.navigate).toHaveBeenLastCalledWith("/shutdown");
    expect(mockRouter.push).toHaveBeenLastCalledWith("/shutdown");
    mockRouter.push.mockClear();
    mockResponse = respond("/plan?src=push&kind=morning", "dismiss");
    await view.rerender(<ReminderHost />);
    expect(mockRouter.navigate).toHaveBeenLastCalledWith("/plan");
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockTasks.update).not.toHaveBeenCalled();
  });

  it("a plain tap opens the action sheet with the web's title and choices; a choice is carried out and closes it", async () => {
    mockResponse = respond(BLOCK);
    await render(<ReminderHost />);
    expect(mockRouter.navigate).toHaveBeenCalledWith("/");
    expect(screen.getByText("Your block is starting.")).toBeTruthy();
    for (const name of ["Start", "Snooze 15m", "Plan"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Snooze 15m" }));
    await act(async () => undefined);
    expect(mockBlocks.move).toHaveBeenCalledWith("b1", "2026-11-22T09:15:00.000Z", "2026-11-22T10:15:00.000Z");
    expect(screen.queryByText("Your block is starting.")).toBeNull();
  });

  it("the sheet closes without doing anything from its scrim", async () => {
    mockResponse = respond("/today?src=push&kind=deadline_day&task=t1");
    await render(<ReminderHost />);
    expect(screen.getByText("Due today.")).toBeTruthy();
    expect(screen.getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual(["Today", "Plan"]);
    // The scrim sits behind the modal sheet, so a screen reader leaves it out; a finger still reaches it.
    await fireEvent.press(screen.getByLabelText("Close", { includeHiddenElements: true }));
    expect(screen.queryByText("Due today.")).toBeNull();
    expect(mockTasks.update).not.toHaveBeenCalled();
  });

  it("waits for the screens and the person's day, and carries a tap out once", async () => {
    mockNavigation = undefined;
    mockReady = false;
    mockResponse = respond(EVE, "today");
    const view = await render(<ReminderHost />);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    mockNavigation = { key: "root" };
    mockReady = true;
    await view.rerender(<ReminderHost />);
    await view.rerender(<ReminderHost />);
    await act(async () => undefined);
    expect(mockTasks.update).toHaveBeenCalledTimes(1);
  });

  it("leaves a notification that is not a reminder alone", async () => {
    mockResponse = { actionIdentifier: PLAIN, notification: { request: { identifier: "x", content: { data: {} } } } };
    await render(<ReminderHost />);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(Notifications.clearLastNotificationResponseAsync).not.toHaveBeenCalled();
  });
});
