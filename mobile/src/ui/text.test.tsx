// Every text in the app is drawn in the look's faces: through the app's own Text and TextInput, never React Native's.
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { font } from "./theme";
import { Text, TextInput } from "./text";

// Node's own, asked for by name: this app's type check knows the phone's globals, not Node's.
const fs = require("fs") as { readdirSync: (dir: string, options: { recursive: true }) => string[]; readFileSync: (file: string, encoding: "utf8") => string };
/** mobile/src, from where this test file is. */
const src = () => (expect.getState().testPath ?? "").split("/ui/text.test.tsx")[0];

describe("the app's Text", () => {
  it("is the only Text and TextInput any file takes", () => {
    const strays = fs
      .readdirSync(src(), { recursive: true })
      .filter((file) => /\.tsx?$/.test(file) && file !== "ui/text.tsx")
      .filter((file) => {
        const imports = fs.readFileSync(`${src()}/${file}`, "utf8").match(/import \{([^}]*)\} from "react-native";/g) ?? [];
        return imports.some((line) => /[{,\s](Text|TextInput)(\s+as\s+\w+)?\s*[,}]/.test(line));
      });
    expect(strays).toEqual([]);
  });

  it("draws a text with no face of its own as it is, so it takes its parent's", async () => {
    await render(
      <Text style={{ fontFamily: font.bold }}>
        <Text testID="inner">inside</Text>
      </Text>,
    );
    expect(StyleSheet.flatten(screen.getByTestId("inner").props.style)?.fontFamily).toBeUndefined();
  });

  it("draws a field in the look's face too", async () => {
    await render(<TextInput accessibilityLabel="Title" style={{ fontFamily: font.medium, fontSize: 16 }} />);
    expect(StyleSheet.flatten(screen.getByLabelText("Title").props.style)?.fontFamily).toBe(font.medium);
  });
});
