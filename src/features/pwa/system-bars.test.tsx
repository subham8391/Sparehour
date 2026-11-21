// @vitest-environment jsdom
// The phone's bars (DECISIONS.md, amendments 2026-10-25 and 2026-11-21): the status bar's colour goes in the
// theme-color metas at once; the navigation bar's goes in the cookie the manifest is served from, and the manifest
// keeps its one address, read again whenever the colours change.
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SystemBars from "./system-bars";

const MANIFEST = "/manifest.webmanifest";
const cookieOf = () => document.cookie.split(/;\s*/).find((c) => c.startsWith("sparehour-bars="));

let link: HTMLLinkElement;
let meta: HTMLMetaElement;

beforeEach(() => {
  document.cookie = "sparehour-bars=; Max-Age=0; Path=/";
  document.head.innerHTML = "";
  link = document.createElement("link");
  link.rel = "manifest";
  link.setAttribute("href", MANIFEST);
  link.setAttribute("crossorigin", "use-credentials");
  meta = document.createElement("meta");
  meta.name = "theme-color";
  meta.media = "(prefers-color-scheme: light)";
  meta.content = "#000000";
  const after = document.createElement("meta");
  after.name = "description";
  document.head.append(meta, link, after);
  document.body.style.backgroundColor = "rgb(233, 230, 251)";
  vi.stubGlobal("matchMedia", () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn(), matches: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-theme");
});

describe("<SystemBars>", () => {
  it("puts the paper in the theme-color metas and the colours in the cookie, and reads the manifest again at its one address", async () => {
    const put = vi.spyOn(document.head, "insertBefore");
    render(<SystemBars />);
    await vi.waitFor(() => expect(cookieOf()).toBe("sparehour-bars=e9e6fb.e9e6fb"));
    expect(meta.content).toBe("#e9e6fb");
    // The status bar follows the page, not the system scheme the meta was written for.
    expect(meta.hasAttribute("media")).toBe(false);
    // The same node at the same address, taken out and put back where it was: never a new location.
    expect(link.getAttribute("href")).toBe(MANIFEST);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe(link);
    expect(document.head.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
    expect([...document.head.children].indexOf(link)).toBe(1);
  });

  it("does not read the manifest again while the colours stay as they are", async () => {
    render(<SystemBars />);
    await vi.waitFor(() => expect(cookieOf()).toBe("sparehour-bars=e9e6fb.e9e6fb"));
    const put = vi.spyOn(document.head, "insertBefore");
    // The same theme stamped again, and a navigation's fresh meta: both run the sync, neither changes a colour.
    document.documentElement.setAttribute("data-theme", "light");
    document.head.append(document.createElement("meta"));
    await new Promise((r) => setTimeout(r, 60));
    expect(put).not.toHaveBeenCalled();
    expect(link.getAttribute("href")).toBe(MANIFEST);
  });

  it("a new look or theme changes the cookie and reads the manifest again, still at the same address", async () => {
    render(<SystemBars />);
    await vi.waitFor(() => expect(cookieOf()).toBe("sparehour-bars=e9e6fb.e9e6fb"));
    const put = vi.spyOn(document.head, "insertBefore");
    document.body.style.backgroundColor = "rgb(16, 27, 58)";
    document.documentElement.setAttribute("data-theme", "dark");
    await vi.waitFor(() => expect(cookieOf()).toBe("sparehour-bars=101b3a.101b3a"));
    expect(meta.content).toBe("#101b3a");
    expect(put).toHaveBeenCalledTimes(1);
    expect(link.getAttribute("href")).toBe(MANIFEST);
  });
});
