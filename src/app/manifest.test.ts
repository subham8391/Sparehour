// The manifest puts Sparehour in Android's share sheet (DECISIONS.md, amendment 2026-10-22): a share opens /share
// with the title, text and link it carried, which the page reads by those names.
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("is a share target that opens /share with title, text and url", () => {
    expect(manifest().share_target).toEqual({ action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } });
  });
});
