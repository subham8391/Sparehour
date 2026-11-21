// A note as Markdown on the phone: every kind of block the web's parser returns is drawn, a link opens only for an
// address on the allow-list, a raw tag stays text, and a checkbox item is a drawing, never a control.
import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Markdown, openNoteLink } from "./markdown";

const mockOpenURL = jest.fn(async (..._args: unknown[]) => true);
jest.mock("expo-linking", () => ({ openURL: (...args: unknown[]) => mockOpenURL(...args) }));

const draw = (source: string, onOpenLink?: (href: string) => void) => render(<Markdown source={source} onOpenLink={onOpenLink} />);
const styleOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style);

beforeEach(() => mockOpenURL.mockClear());

describe("<Markdown>", () => {
  it("draws a heading as a header, three levels deep", async () => {
    await draw("# Plan\n## Steps\n#### Small print");
    expect(screen.getAllByRole("header").map((h) => h.props.children.join(""))).toEqual(["Plan", "Steps", "Small print"]);
    expect(styleOf("Plan").fontSize).toBeGreaterThan(styleOf("Steps").fontSize);
  });

  it("draws a paragraph and keeps its line breaks", async () => {
    await draw("line one\nline two\n\nnext");
    expect(screen.getByText("line one\nline two")).toBeTruthy();
    expect(screen.getByText("next")).toBeTruthy();
  });

  it("draws emphasis: strong, italic and struck words, and leaves snake_case alone", async () => {
    await draw("Some **bold**, *italic* and ~~gone~~ words in snake_case_name.");
    expect(styleOf("bold").fontFamily).toBe("PlusJakartaSans_600SemiBold");
    expect(styleOf("italic").fontStyle).toBe("italic");
    expect(styleOf("gone").textDecorationLine).toBe("line-through");
    expect(screen.getByText(/snake_case_name/)).toBeTruthy();
  });

  it("draws inline code in the fixed-width face", async () => {
    await draw("run `npm run build` first");
    expect(styleOf("npm run build").fontFamily).toMatch(/monospace|Menlo/);
  });

  it("draws a code block as it was written, markup and all", async () => {
    await draw("```\nconst x = <b>1</b>;\n  indented\n```");
    expect(screen.getByText("const x = <b>1</b>;\n  indented")).toBeTruthy();
  });

  it("draws a bulleted list and a numbered one from where it starts, with what is nested under an item", async () => {
    await draw("- one\n  - inner\n- two\n\n3. third\n4. fourth");
    expect(screen.getAllByText("•")).toHaveLength(3);
    expect(screen.getByText("inner")).toBeTruthy();
    expect(screen.getByText("3.")).toBeTruthy();
    expect(screen.getByText("4.")).toBeTruthy();
    expect(screen.getByText("fourth")).toBeTruthy();
  });

  it("draws checkbox items as boxes that cannot be ticked, read out as To do and Done", async () => {
    await draw("- [ ] buy milk\n- [x] call Dana");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByLabelText("To do:")).toBeTruthy();
    expect(screen.getByLabelText("Done:")).toBeTruthy();
    expect(styleOf("call Dana").textDecorationLine).toBe("line-through");
    expect(styleOf("buy milk").textDecorationLine).toBeUndefined();
    // No marker beside a box.
    expect(screen.queryByText("•")).toBeNull();
  });

  it("draws a quote with what is inside it", async () => {
    await draw("> quoted **words**\n> - and a list");
    expect(screen.getByText("words")).toBeTruthy();
    expect(screen.getByText("and a list")).toBeTruthy();
  });

  it("draws a rule between two paragraphs", async () => {
    const view = await draw("above\n\n---\n\nbelow");
    expect(screen.getByText("above")).toBeTruthy();
    expect(screen.getByText("below")).toBeTruthy();
    expect(view.toJSON()).toMatchObject({ children: [{ type: "Text" }, { type: "View", props: { "aria-hidden": true } }, { type: "Text" }] });
  });

  it("opens a link on the allow-list: a named one, a bare address, a www address and a mailto", async () => {
    const onOpenLink = jest.fn();
    await draw("See [the brief](https://example.com/brief), https://example.org/x, www.example.net and <mailto:dana@example.com>.", onOpenLink);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    for (const link of links) await fireEvent.press(link);
    expect(onOpenLink.mock.calls.map(([href]) => href)).toEqual(["https://example.com/brief", "https://example.org/x", "https://www.example.net/", "mailto:dana@example.com"]);
  });

  it("opens a link outside the app when nothing else is handed in", async () => {
    await draw("[the brief](https://example.com/brief)");
    await fireEvent.press(screen.getByRole("link"));
    expect(mockOpenURL).toHaveBeenCalledWith("https://example.com/brief");
  });

  it("never makes a link of an address off the allow-list, whatever its spelling: the words stay as text", async () => {
    await draw(["[click](javascript:alert(1))", "[click2](JaVaScRiPt:alert(1))", "[pic](data:text/html;base64,PHNjcmlwdD4=)", "<javascript:alert(1)>", "[file](file:///etc/passwd)", "[app](intent://scan/#Intent;scheme=zxing;end)", "[tel](tel:+15550100)"].join("\n\n"));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/click2/)).toBeTruthy();
    expect(screen.getByText(/<javascript:alert\(1\)>/)).toBeTruthy();
  });

  it("does not open an address off the allow-list even when asked to directly", () => {
    for (const bad of ["javascript:alert(1)", "intent://scan", "file:///etc/passwd", "tel:+15550100", "sparehour://settings", ""]) openNoteLink(bad);
    expect(mockOpenURL).not.toHaveBeenCalled();
    openNoteLink("mailto:dana@example.com");
    expect(mockOpenURL).toHaveBeenCalledWith("mailto:dana@example.com");
  });

  it("keeps a raw tag as text: nothing is ever markup", async () => {
    await draw('<img src=x onerror="alert(1)"> and <script>alert(2)</script>');
    expect(screen.getByText('<img src=x onerror="alert(1)"> and <script>alert(2)</script>')).toBeTruthy();
    expect(screen.queryByRole("image")).toBeNull();
  });

  it("draws nothing for an empty note", async () => {
    const view = await draw("");
    expect(view.toJSON()).toMatchObject({ type: "View", children: [] });
  });
});
