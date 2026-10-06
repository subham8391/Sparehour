// @vitest-environment jsdom
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BlockNudge, { nudgeEligible } from "./block-nudge";
import { BLOCK_NUDGE_KEY, closeBlockNudge, noteBlockCreated, useBlockNudgePending } from "./block-nudge-store";
import type { PushApi } from "./use-push";

const push = {
  permission: "default",
  platform: { isIOS: false, isSafari: false, isFirefox: false, standalone: false, touch: false, ua: "" },
  workerAvailable: true,
  subscribed: false,
  busy: false,
  error: null as string | null,
  enable: vi.fn(),
} as unknown as PushApi & { enable: ReturnType<typeof vi.fn> };
let settings: { notify_block_start: number | null }[] = [{ notify_block_start: 1 }];
vi.mock("./use-push", () => ({ usePush: () => push }));
vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: settings }) }));

function permission(p: NotificationPermission) {
  vi.stubGlobal("Notification", { permission: p, requestPermission: vi.fn() });
}

beforeEach(() => {
  localStorage.clear();
  permission("default");
  settings = [{ notify_block_start: 1 }];
  Object.assign(push, { permission: "default", error: null, workerAvailable: true });
  push.enable.mockReset();
  closeBlockNudge();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("nudgeEligible", () => {
  const base = { permission: "default" as const, platform: { isIOS: false, standalone: false }, workerAvailable: true, notifyBlockStart: true, dismissed: false };
  it("asks only while the answer is open, push works here and block reminders are on", () => {
    expect(nudgeEligible(base)).toBe(true);
    expect(nudgeEligible({ ...base, permission: "granted" })).toBe(false);
    expect(nudgeEligible({ ...base, permission: "denied" })).toBe(false);
    expect(nudgeEligible({ ...base, permission: "unsupported" })).toBe(false);
    expect(nudgeEligible({ ...base, workerAvailable: false })).toBe(false);
    expect(nudgeEligible({ ...base, notifyBlockStart: false })).toBe(false);
    expect(nudgeEligible({ ...base, dismissed: true })).toBe(false);
  });
  it("never in Safari on an iPhone outside the Home Screen app", () => {
    expect(nudgeEligible({ ...base, platform: { isIOS: true, standalone: false } })).toBe(false);
    expect(nudgeEligible({ ...base, platform: { isIOS: true, standalone: true } })).toBe(true);
  });
});

describe("the first-block ask", () => {
  it("a block made on a device not yet asked opens the ask; one already answered does not", () => {
    const { result } = renderHook(() => useBlockNudgePending());
    expect(result.current).toBe(false);
    act(() => noteBlockCreated());
    expect(result.current).toBe(true);
    act(() => closeBlockNudge());

    permission("granted");
    act(() => noteBlockCreated());
    expect(result.current).toBe(false);
    permission("default");
    localStorage.setItem(BLOCK_NUDGE_KEY, "dismissed");
    act(() => noteBlockCreated());
    expect(result.current).toBe(false);
  });

  it("Yes asks the browser from the tap and subscribes; once answered the ask goes", async () => {
    const user = userEvent.setup();
    act(() => noteBlockCreated());
    const { result } = renderHook(() => useBlockNudgePending());
    render(<BlockNudge />);
    expect(screen.getByText("Want a nudge when this starts?")).toBeInTheDocument();
    push.enable.mockImplementation(async () => permission("granted"));
    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(push.enable).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });

  it("Not now is remembered on this device and the ask never comes back here", async () => {
    const user = userEvent.setup();
    act(() => noteBlockCreated());
    const { result } = renderHook(() => useBlockNudgePending());
    render(<BlockNudge />);
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(localStorage.getItem(BLOCK_NUDGE_KEY)).toBe("dismissed");
    expect(result.current).toBe(false);
    act(() => noteBlockCreated());
    expect(result.current).toBe(false);
  });

  it("shows nothing with block reminders off, and says plainly when subscribing failed", () => {
    settings = [{ notify_block_start: 0 }];
    const { container, rerender } = render(<BlockNudge />);
    expect(container).toBeEmptyDOMElement();
    Object.assign(push, { error: "Push is not configured on this server." });
    rerender(<BlockNudge />);
    expect(screen.getByRole("alert")).toHaveTextContent("Push is not configured on this server.");
  });

  it("its buttons are 44 px on touch", () => {
    render(<BlockNudge />);
    expect(screen.getByRole("button", { name: "Yes" }).className).toContain("h-11");
    expect(screen.getByRole("button", { name: "Not now" }).className).toContain("h-11");
  });
});
