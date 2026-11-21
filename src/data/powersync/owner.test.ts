// @vitest-environment jsdom
// Whose copy this device holds (DECISIONS.md, amendment 2026-11-21): the rule the connector applies to each sync
// token, the store the provider's gate reads, and the mark the sign-in page leaves.
import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetSignIn, isForeign, markSignInStarted, readDeviceOwner, setDeviceOwner, signInPending, subscribeDeviceOwner } from "./owner";

afterEach(() => {
  setDeviceOwner("unknown");
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("isForeign", () => {
  it("is false on a device with no copy, and for the account's own copy", () => {
    expect(isForeign([], "u1")).toBe(false);
    expect(isForeign(["u1"], "u1")).toBe(false);
  });

  it("is true when any account row on the device is someone else's", () => {
    expect(isForeign(["u2"], "u1")).toBe(true);
    // A copy caught half replaced: the new account's row beside the last one's.
    expect(isForeign(["u1", "u2"], "u1")).toBe(true);
  });

  it("settles nothing when the server does not say who is signed in", () => {
    expect(isForeign(["u2"], undefined)).toBe(false);
    expect(isForeign(["u2"], null)).toBe(false);
    expect(isForeign(["u2"], "")).toBe(false);
  });
});

describe("the device owner store", () => {
  it("starts unknown and tells its listeners of each change, once", () => {
    const listener = vi.fn();
    const stop = subscribeDeviceOwner(listener);
    expect(readDeviceOwner()).toBe("unknown");
    setDeviceOwner("foreign");
    setDeviceOwner("foreign");
    expect(readDeviceOwner()).toBe("foreign");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    setDeviceOwner("ok");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("the sign-in mark", () => {
  it("is left by the sign-in page and forgotten once the copy is known to be the account's own", () => {
    expect(signInPending()).toBe(false);
    markSignInStarted();
    expect(signInPending()).toBe(true);
    forgetSignIn();
    expect(signInPending()).toBe(false);
  });

  it("storage that cannot be read means no hold, and nothing throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(() => markSignInStarted()).not.toThrow();
    expect(signInPending()).toBe(false);
    expect(() => forgetSignIn()).not.toThrow();
  });
});
