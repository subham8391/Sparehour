import { describe, expect, it, vi } from "vitest";
import { detectInstallSignals, installState, persistenceCopy, requestPersistence } from "./install";

const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const MAC_SAFARI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const CHROME_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36";

describe("installState", () => {
  it("knows when it is already installed", () => {
    expect(installState({ standalone: true, canPrompt: true, isIOS: true, isSafari: true })).toEqual({ kind: "installed" });
  });

  it("offers a button where the browser can prompt, and the gesture elsewhere", () => {
    expect(installState({ standalone: false, canPrompt: true, isIOS: false, isSafari: false })).toEqual({ kind: "prompt" });
    expect(installState({ standalone: false, canPrompt: false, isIOS: true, isSafari: true }).kind).toBe("coach-ios");
    expect(installState({ standalone: false, canPrompt: false, isIOS: false, isSafari: true }).kind).toBe("coach-safari");
    expect(installState({ standalone: false, canPrompt: false, isIOS: false, isSafari: false })).toEqual({ kind: "browser-menu" });
  });

  it("the iOS coaching is about the gesture, not the manifest", () => {
    const s = installState({ standalone: false, canPrompt: false, isIOS: true, isSafari: true });
    expect(s.kind === "coach-ios" && s.steps.join(" ")).toMatch(/Share.*Add to Home Screen/);
  });
});

describe("detectInstallSignals", () => {
  it("tells iOS, Safari and Chromium apart, and reads standalone from either signal", () => {
    expect(detectInstallSignals({ userAgent: IOS_UA, standalone: false }, false, false)).toMatchObject({ isIOS: true, isSafari: true, standalone: false });
    expect(detectInstallSignals({ userAgent: IOS_UA, standalone: true }, false, false).standalone).toBe(true);
    expect(detectInstallSignals({ userAgent: MAC_SAFARI_UA }, false, false)).toMatchObject({ isIOS: false, isSafari: true });
    expect(detectInstallSignals({ userAgent: CHROME_UA }, true, true)).toMatchObject({ isIOS: false, isSafari: false, standalone: true, canPrompt: true });
  });
});

describe("persistence", () => {
  it("asks once, after which the answer stands", async () => {
    const persist = vi.fn().mockResolvedValue(false);
    const persisted = vi.fn().mockResolvedValue(false);
    const memory = new Map<string, string>();
    const store = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
    expect(await requestPersistence({ persist, persisted }, store)).toBe("unprotected");
    expect(await requestPersistence({ persist, persisted }, store)).toBe("unprotected");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("reports protected when the browser already granted it, and unknown without the API", async () => {
    expect(await requestPersistence({ persist: vi.fn(), persisted: vi.fn().mockResolvedValue(true) }, null)).toBe("protected");
    expect(await requestPersistence(undefined, null)).toBe("unknown");
    expect(await requestPersistence({ persist: vi.fn().mockResolvedValue(true), persisted: vi.fn().mockResolvedValue(false) }, null)).toBe("protected");
  });

  it("says what to do about it in plain words", () => {
    expect(persistenceCopy("protected", false)).toMatch(/protected from automatic cleanup/);
    expect(persistenceCopy("unprotected", false)).toMatch(/install the app/);
    expect(persistenceCopy("unprotected", true)).toMatch(/use the app a little more/);
    expect(persistenceCopy("unknown", false)).toMatch(/Checking/);
  });
});
