// The manifest (DECISIONS.md, amendments 2026-10-22, -23, -25 and 2026-11-21): a share target that opens /share;
// colours the page asks for in its cookie (the installed app's navigation bar follows the look and theme), Sky's dark
// paper without them, and nothing but a plain hex colour is ever echoed back.
import { describe, expect, it } from "vitest";
import { GET } from "@/app/manifest.webmanifest/route";
import { PAPER } from "@/features/commands/theme";
import { barsCookie, barsFromCookie, cssToHex, hexParam } from "./bar-colors";
import { buildManifest } from "./manifest";

describe("manifest", () => {
  it("is a share target that opens /share with title, text and url", () => {
    expect(buildManifest().share_target).toEqual({ action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } });
  });

  it("its Add a task shortcut opens Today with the mark quick add opens on (quick-add-provider.tsx)", () => {
    const add = buildManifest().shortcuts?.find((s) => s.name === "Add a task");
    expect(add?.url).toBe("/today?quickadd=1");
  });

  it("still reads colours from an old address where there is no cookie, and is the dark paper without either", async () => {
    const asked = await (await GET(new Request("https://x.test/manifest.webmanifest?bar=FBFDFF&paper=e8f0fa"))).json();
    expect(asked).toMatchObject({ theme_color: "#fbfdff", background_color: "#e8f0fa", display: "standalone" });
    const plain = await GET(new Request("https://x.test/manifest.webmanifest"));
    expect(plain.headers.get("content-type")).toBe("application/manifest+json");
    expect(await plain.json()).toMatchObject({ theme_color: PAPER.dark, background_color: PAPER.dark });
  });

  it("takes the colours from the cookie at its one address, is never shared, and an old address never pins an old look", async () => {
    const cookie = "other=1; sparehour-bars=1b1e25.15171c";
    const first = await GET(new Request("https://x.test/manifest.webmanifest", { headers: { cookie } }));
    expect(await first.json()).toMatchObject({ theme_color: "#1b1e25", background_color: "#15171c" });
    // Revalidated on every fetch, so a changed cookie is a changed manifest.
    expect(first.headers.get("cache-control")).toBe("private, no-cache");
    expect(first.headers.get("vary")).toBe("Cookie");
    // An app installed while the link carried the colours asks with them still: the cookie is the look on screen now.
    const asked = await GET(new Request("https://x.test/manifest.webmanifest?bar=fbfdff&paper=e8f0fa", { headers: { cookie } }));
    expect(await asked.json()).toMatchObject({ theme_color: "#1b1e25", background_color: "#15171c" });
  });

  it("writes and reads the cookie, and a bad one counts for nothing", () => {
    expect(barsCookie("#1b1e25", "#15171c")).toBe("sparehour-bars=1b1e25.15171c; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(barsFromCookie("a=b; sparehour-bars=1B1E25.15171c")).toEqual({ bar: "#1b1e25", paper: "#15171c" });
    expect(barsFromCookie("sparehour-bars=<x>.zz")).toEqual({ bar: null, paper: null });
    expect(barsFromCookie(null)).toEqual({ bar: null, paper: null });
  });

  it("echoes nothing but a plain hex colour", async () => {
    const odd = await (await GET(new Request("https://x.test/manifest.webmanifest?bar=red;x&paper=%3Cscript%3E"))).json();
    expect(odd).toMatchObject({ theme_color: PAPER.dark, background_color: PAPER.dark });
    expect(["fff", "12345g", "", null].map(hexParam)).toEqual([null, null, null, null]);
  });
});

describe("bar colours", () => {
  it("reads computed colours as hex, laying a see-through one over what is under it", () => {
    expect(cssToHex("rgb(16, 27, 58)")).toBe("#101b3a");
    expect(cssToHex("rgba(0, 0, 0, 0.5)", [255, 255, 255])).toBe("#808080");
    expect(cssToHex("rgb(255 255 255 / 50%)", [0, 0, 0])).toBe("#808080");
    expect(cssToHex("oklch(0.5 0.1 200)")).toBeNull();
  });

});
