// The frame that keeps one part of its body in sight: the header and what is before the part scroll away, the part
// stays, and it is put on paper only once the body has been scrolled as far as it.
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Text } from "./text";
import { StickyScreen } from "./sticky-screen";
import { colours } from "./theme";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const frame = (
  <StickyScreen title="Wednesday 18 November" eyebrow="Today · Afternoon" actions={<Text>far edge</Text>} before={<Text>a note</Text>} sticky={<Text>the hero</Text>}>
    <Text>the lists</Text>
  </StickyScreen>
);
const paper = () => StyleSheet.flatten(screen.getByTestId("sticky-part").props.style).backgroundColor;

describe("<StickyScreen>", () => {
  it("draws the header as Screen does, then what is before the part, the part, and the rest", async () => {
    await render(frame);
    expect(screen.getByText("TODAY · AFTERNOON")).toBeTruthy();
    expect(screen.getByRole("header", { name: "Wednesday 18 November" })).toBeTruthy();
    expect(screen.getByText("far edge")).toBeTruthy();
    expect(screen.getByText("a note")).toBeTruthy();
    expect(within(screen.getByTestId("sticky-part")).getByText("the hero")).toBeTruthy();
    expect(within(screen.getByTestId("sticky-part")).queryByText("the lists")).toBeNull();
    expect(screen.getByText("the lists")).toBeTruthy();
  });

  it("pins the part, which is the second thing in what scrolls", async () => {
    await render(frame);
    expect(screen.getByTestId("sticky-scroll").props.stickyHeaderIndices).toEqual([1]);
  });

  it("sits on the sky at rest, and on paper once the body is scrolled as far as the part", async () => {
    await render(frame);
    const scroll = screen.getByTestId("sticky-scroll");
    // The header and the note are 140 points tall: that is where the part begins.
    await fireEvent(screen.getByTestId("sticky-before"), "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 140 } } });
    expect(paper()).toBeUndefined();
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { y: 60 } } });
    expect(paper()).toBeUndefined();
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { y: 140 } } });
    expect(paper()).toBe(colours.light.paper);
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { y: 20 } } });
    expect(paper()).toBeUndefined();
  });
});
