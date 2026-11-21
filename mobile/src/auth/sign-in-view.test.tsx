// The sign-in screen as the phone draws it: Google first where the auth server offers it, with the web's words,
// then the emailed code; what each control calls.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { SignInView, type SignInViewProps } from "./sign-in-view";

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const props = (over: Partial<SignInViewProps> = {}): SignInViewProps => ({
  google: false,
  sentTo: null,
  busy: false,
  error: null,
  onGoogle: jest.fn(),
  onSend: jest.fn(),
  onVerify: jest.fn(),
  onAnotherEmail: jest.fn(),
  ...over,
});

describe("<SignInView>", () => {
  it("has no Google button until the auth server says Google is on", async () => {
    await render(<SignInView {...props()} />);
    expect(screen.getByRole("header", { name: "Sparehour" })).toBeTruthy();
    expect(screen.getByText("Find the spare hours in your day.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("offers Google first, in the web's words, then the email", async () => {
    const p = props({ google: true });
    await render(<SignInView {...p} />);
    await fireEvent.press(screen.getByRole("button", { name: "Continue with Google" }));
    expect(p.onGoogle).toHaveBeenCalledTimes(1);
    // The divider is decoration: a screen reader goes from the Google button to the email field.
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.getByText("or", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeTruthy();
  });

  it("sends the email that was typed", async () => {
    const p = props({ google: true });
    await render(<SignInView {...p} />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "sam@example.com");
    await fireEvent.press(screen.getByRole("button", { name: "Email me a code" }));
    expect(p.onSend).toHaveBeenCalledWith("sam@example.com");
  });

  it("is not pressable twice while something is on its way", async () => {
    const p = props({ google: true, busy: true });
    await render(<SignInView {...p} />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Continue with Google" }));
    expect(p.onGoogle).not.toHaveBeenCalled();
  });

  it("asks for the code once it has been sent, without Google beside it, and can go back to another email", async () => {
    const p = props({ google: true, sentTo: "sam@example.com" });
    await render(<SignInView {...p} />);
    expect(screen.getByText("We sent a code to sam@example.com.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Code"), "123456");
    await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
    expect(p.onVerify).toHaveBeenCalledWith("123456");
    await fireEvent.press(screen.getByRole("button", { name: "Use another email" }));
    expect(p.onAnotherEmail).toHaveBeenCalledTimes(1);
  });

  it("says what went wrong as an alert", async () => {
    await render(<SignInView {...props({ google: true, error: "Couldn't reach Sparehour. Check your connection and try again." })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach Sparehour. Check your connection and try again.");
  });
});
