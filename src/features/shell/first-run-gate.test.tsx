// @vitest-environment jsdom
// The first-run gate: a new account goes to /welcome before anything else, once its settings row is on the
// device; an account that is set up, made before the first run existed, or not loaded yet stays where it is.
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: undefined as { onboarded_at: string | null; created_at: string | null }[] | undefined,
  pathname: "/today",
  replace: vi.fn(),
}));
vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: h.rows }) }));
vi.mock("next/navigation", () => ({ usePathname: () => h.pathname, useRouter: () => ({ replace: h.replace }) }));

import { FIRST_RUN_SINCE, FirstRunGate, firstRunPending } from "./first-run-gate";

const NEW = "2026-10-08T09:00:00.000Z";

beforeEach(() => {
  h.rows = undefined;
  h.pathname = "/today";
  h.replace.mockClear();
});

describe("firstRunPending", () => {
  it("is pending only for a loaded, unstamped row made since the first run existed", () => {
    expect(firstRunPending(undefined)).toBe(false);
    expect(firstRunPending(null)).toBe(false);
    expect(firstRunPending({ onboarded_at: null, created_at: NEW })).toBe(true);
    expect(firstRunPending({ onboarded_at: "2026-10-08T09:05:00Z", created_at: NEW })).toBe(false);
  });

  it("leaves alone an account made before then whose local row has no stamp yet", () => {
    expect(firstRunPending({ onboarded_at: null, created_at: "2026-09-14 02:59:30.807597Z" })).toBe(false);
    expect(firstRunPending({ onboarded_at: null, created_at: null })).toBe(false);
    // Either timestamp shape sync can deliver compares as text.
    expect(firstRunPending({ onboarded_at: null, created_at: `${FIRST_RUN_SINCE} 00:00:01Z` })).toBe(true);
    expect(firstRunPending({ onboarded_at: null, created_at: `${FIRST_RUN_SINCE}T00:00:01Z` })).toBe(true);
  });
});

describe("<FirstRunGate>", () => {
  it("does nothing before the settings row has loaded", () => {
    render(<FirstRunGate />);
    h.rows = [];
    render(<FirstRunGate />);
    expect(h.replace).not.toHaveBeenCalled();
  });

  it("sends a new account to /welcome", () => {
    h.rows = [{ onboarded_at: null, created_at: NEW }];
    render(<FirstRunGate />);
    expect(h.replace).toHaveBeenCalledWith("/welcome");
  });

  it("stays put on /welcome itself, and for an account that is set up", () => {
    h.rows = [{ onboarded_at: null, created_at: NEW }];
    h.pathname = "/welcome";
    render(<FirstRunGate />);
    h.pathname = "/inbox";
    h.rows = [{ onboarded_at: "2026-10-08T09:05:00Z", created_at: NEW }];
    render(<FirstRunGate />);
    expect(h.replace).not.toHaveBeenCalled();
  });
});
