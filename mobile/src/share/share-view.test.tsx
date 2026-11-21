// The page a share with nothing in it opens: the web's words, and the way to Today.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ShareView } from "./share-view";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ canGoBack: () => false, back: jest.fn(), replace: jest.fn() }) }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));

describe("<ShareView>", () => {
  it("says nothing came through, and goes to Today", async () => {
    const onToday = jest.fn();
    await render(<ShareView onToday={onToday} />);
    expect(screen.getByRole("header", { name: "Nothing came through" })).toBeTruthy();
    expect(screen.getByText("SHARE")).toBeTruthy();
    expect(screen.getByText("The app you shared from sent no words or link.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Go to Today" }));
    expect(onToday).toHaveBeenCalledTimes(1);
  });
});
