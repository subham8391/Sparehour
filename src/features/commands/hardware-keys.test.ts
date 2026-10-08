// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isHardwareKey, watchHardwareKeys } from "./hardware-keys";

const press = (target: EventTarget, init: KeyboardEventInit) => target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));

describe("a hardware keyboard on a touch device (SCREENS.md §24 Touch)", () => {
  afterEach(() => {
    delete document.documentElement.dataset.keys;
    sessionStorage.clear();
    document.body.innerHTML = "";
  });

  it("typing into a field is not a hardware keypress: an on-screen keyboard only types there", () => {
    const stop = watchHardwareKeys();
    const field = document.body.appendChild(document.createElement("input"));
    press(field, { key: "a" });
    const editor = document.body.appendChild(document.createElement("div"));
    editor.setAttribute("contenteditable", "true");
    press(editor, { key: "b" });
    expect("keys" in document.documentElement.dataset).toBe(false);
    stop();
  });

  it("a key outside a field marks <html> for the rest of the visit, and this tab's next page", () => {
    const stop = watchHardwareKeys();
    press(document.body, { key: "Unidentified" });
    expect("keys" in document.documentElement.dataset).toBe(false);
    press(document.body, { key: "j" });
    expect(document.documentElement.dataset.keys).toBe("");
    stop();
    delete document.documentElement.dataset.keys;
    // A reload in the same tab picks it up at once.
    watchHardwareKeys()();
    expect(document.documentElement.dataset.keys).toBe("");
  });

  it("composition and IME placeholders never count", () => {
    expect(isHardwareKey({ key: "a", target: document.body, isComposing: true })).toBe(false);
    expect(isHardwareKey({ key: "Process", target: document.body, isComposing: false })).toBe(false);
    expect(isHardwareKey({ key: "?", target: document.body, isComposing: false })).toBe(true);
  });
});