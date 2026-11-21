// A look's faces are read when it is chosen, once; until they are in, the text stays in the faces it was in.
import { act, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Text } from "../text";
import { font } from "../theme";
import { faceLook, loadLookFaces, resetLookFaces } from "./face-loader";
import { resetLookChoice, setLookChoice } from "./look-choice";

jest.mock("expo-font", () => ({ isLoaded: () => false, loadAsync: jest.fn(async () => undefined) }));

let reads: { files: string[]; answer: () => void; fail: () => void }[] = [];
beforeEach(() => {
  reads = [];
  resetLookChoice();
  resetLookFaces((files) => new Promise<void>((resolve, reject) => void reads.push({ files: Object.keys(files), answer: resolve, fail: () => reject(new Error("no file")) })));
});

const familyOf = (label: string): string | undefined => StyleSheet.flatten(screen.getByText(label).props.style)?.fontFamily;

function Title() {
  return <Text style={{ fontFamily: font.display, fontSize: 30 }}>Today</Text>;
}

describe("the look's faces", () => {
  it("reads a look's files once, however often it is asked", async () => {
    const first = loadLookFaces("tide");
    const second = loadLookFaces("tide");
    expect(reads).toHaveLength(1);
    expect(reads[0].files.sort()).toEqual(["Lexend_400Regular", "Lexend_500Medium", "Lexend_600SemiBold", "Lexend_700Bold"]);
    reads[0].answer();
    await Promise.all([first, second]);
    await loadLookFaces("tide");
    expect(reads).toHaveLength(1);
  });

  it("never reads Sky's, which come with the app", async () => {
    await loadLookFaces("sky");
    expect(reads).toHaveLength(0);
  });

  it("keeps the old face until the chosen look's files are in, then redraws in them", async () => {
    await render(<Title />);
    expect(familyOf("Today")).toBe("PlusJakartaSans_800ExtraBold");
    await act(async () => setLookChoice("pulse"));
    // Chosen, not in yet: still Sky's face, never the system's.
    expect(familyOf("Today")).toBe("PlusJakartaSans_800ExtraBold");
    expect(faceLook()).toBe("sky");
    await act(async () => reads[0].answer());
    expect(familyOf("Today")).toBe("BigShouldersDisplay_900Black");
    // Back to a look already in: at once, nothing read again.
    await act(async () => setLookChoice("sky"));
    expect(familyOf("Today")).toBe("PlusJakartaSans_800ExtraBold");
    await act(async () => setLookChoice("pulse"));
    expect(familyOf("Today")).toBe("BigShouldersDisplay_900Black");
    expect(reads).toHaveLength(1);
  });

  it("draws only the look chosen last when an earlier one finishes after it was left", async () => {
    await render(<Title />);
    await act(async () => setLookChoice("pulse"));
    await act(async () => setLookChoice("tide"));
    await act(async () => reads[0].answer());
    expect(faceLook()).toBe("sky");
    await act(async () => reads[1].answer());
    expect(familyOf("Today")).toBe("Lexend_600SemiBold");
  });

  it("draws Sky's faces for a look whose files could not be read, and tries again next time", async () => {
    await render(<Title />);
    await act(async () => setLookChoice("tide"));
    await act(async () => reads[0].fail());
    expect(familyOf("Today")).toBe("PlusJakartaSans_800ExtraBold");
    await act(async () => setLookChoice("sky"));
    await act(async () => setLookChoice("tide"));
    expect(reads).toHaveLength(2);
    await act(async () => reads[1].answer());
    expect(familyOf("Today")).toBe("Lexend_600SemiBold");
  });
});
