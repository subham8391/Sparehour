// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion, scrollMotion } from "./reduced-motion";

const media = (reduce: boolean) => (query: string) => ({ matches: reduce && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} });

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.motion;
});

describe("reduced motion in script", () => {
  it("follows the system setting", () => {
    vi.stubGlobal("matchMedia", media(true));
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollMotion()).toBe("auto");
    vi.stubGlobal("matchMedia", media(false));
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollMotion()).toBe("smooth");
  });

  it("and this device's Reduce in Settings › Appearance, whatever the system says", () => {
    vi.stubGlobal("matchMedia", media(false));
    document.documentElement.dataset.motion = "reduce";
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollMotion()).toBe("auto");
  });
});
