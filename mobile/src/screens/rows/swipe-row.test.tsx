// The swipe gesture itself, driven as a finger would: short of the reveal point the row springs back, past it the
// side's buttons rest open and a tap runs one, past the commit point letting go runs the first (never Drop), a side
// with nothing on it does not move, and rows being ticked do not swipe. The thresholds are the web's (swipe.ts).
import "react-native-gesture-handler/jestSetup";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { GestureHandlerRootView, State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import { BUTTON_W, commitAt } from "@/features/tasks/swipe";
import type { SwipeButton } from "./rows-context";
import { SWIPE_TEST_ID, SwipeRow } from "./swipe-row";

// The animation library's native half is not in a test run, and this package's Jest cannot load its own mock (it
// looks for packages in one folder only). Stood in for by the four things the row uses: a value, a style made from
// it, a slide that lands at once, and a view.
jest.mock("react-native-worklets", () => {
  throw new Error("not in a test run");
});
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    // The gesture library asks the animation library for these two as it loads.
    default: { View, createAnimatedComponent: (component: unknown) => component },
    isSharedValue: () => false,
    useSharedValue: (initial: number) => jest.requireActual("react").useRef({ value: initial }).current,
    useAnimatedStyle: (style: () => object) => style(),
    withTiming: (to: number) => to,
  };
});

const WIDTH = 360;
const button = (label: string): SwipeButton => ({ label, run: jest.fn() });
const show = async (right: SwipeButton[], left: SwipeButton[], enabled = true) => {
  const view = await render(
    <GestureHandlerRootView>
      <SwipeRow right={right} left={left} enabled={enabled}>
        <Text>Draft the proposal</Text>
      </SwipeRow>
    </GestureHandlerRootView>,
  );
  await fireEvent(screen.getByTestId("row-swipe-frame"), "layout", { nativeEvent: { layout: { width: WIDTH, height: 56, x: 0, y: 0 } } });
  return view;
};
/** A finger that travels `dx` sideways and lets go. */
const swipe = (dx: number) =>
  act(async () => {
    fireGestureHandler(getByGestureTestId(SWIPE_TEST_ID), [{ state: State.BEGAN, translationX: 0 }, { state: State.ACTIVE, translationX: dx / 2 }, { translationX: dx }, { state: State.END, translationX: dx }]);
  });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("<SwipeRow>", () => {
  it("a full swipe right runs the first action; nothing rests open", async () => {
    const complete = button("Complete");
    await show([complete], [button("Tomorrow"), button("Someday")]);
    await swipe(commitAt(WIDTH) + 5);
    expect(complete.run).toHaveBeenCalledTimes(1);
    await act(async () => void jest.runAllTimers());
    expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
  });

  it("a partial swipe left leaves Tomorrow · Someday open as named buttons; a tap runs one and shuts them", async () => {
    const tomorrow = button("Tomorrow");
    const someday = button("Someday");
    await show([button("Complete")], [tomorrow, someday]);
    await swipe(-BUTTON_W);
    expect(tomorrow.run).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Someday" }));
    expect(someday.run).toHaveBeenCalledTimes(1);
    await act(async () => void jest.runAllTimers());
    expect(screen.queryByRole("button", { name: "Someday" })).toBeNull();
  });

  it("a touch on the row closes it while it rests open, and does nothing else", async () => {
    await show([button("Complete")], [button("Tomorrow")]);
    await swipe(-BUTTON_W);
    await fireEvent.press(screen.getByRole("button", { name: "Close the row’s actions" }));
    await act(async () => void jest.runAllTimers());
    expect(screen.queryByRole("button", { name: "Tomorrow" })).toBeNull();
  });

  it("short of the reveal point it springs back", async () => {
    const tomorrow = button("Tomorrow");
    await show([], [tomorrow]);
    await swipe(-20);
    await act(async () => void jest.runAllTimers());
    expect(screen.queryByRole("button", { name: "Tomorrow" })).toBeNull();
    expect(tomorrow.run).not.toHaveBeenCalled();
  });

  it("Drop is never a full swipe: however far the finger goes it only rests open, for a tap", async () => {
    const drop = button("Drop");
    await show([button("Today")], [drop]);
    await swipe(-(WIDTH - 10));
    expect(drop.run).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Drop" }));
    expect(drop.run).toHaveBeenCalledTimes(1);
  });

  it("a side with nothing on it does not move or run anything", async () => {
    const reopen = button("Reopen");
    await show([reopen], []);
    await swipe(-(WIDTH - 10));
    await act(async () => void jest.runAllTimers());
    expect(reopen.run).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Reopen" })).toBeNull();
  });
});
