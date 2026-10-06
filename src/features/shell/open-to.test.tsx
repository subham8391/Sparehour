// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenTo, openToTarget } from "./open-to";

const replace = vi.fn();
let rows: { default_view: string | null }[] | undefined = [];
vi.mock("next/navigation", () => ({ usePathname: () => window.location.pathname, useRouter: () => ({ replace }) }));
vi.mock("@/data/powersync", () => ({ useQuery: () => ({ data: rows }) }));

beforeEach(() => {
  replace.mockClear();
});

describe("openToTarget", () => {
  it("sends an app open to the chosen view, Today by default, and leaves other visits alone", () => {
    expect(openToTarget("pwa", "inbox")).toBe("/inbox");
    expect(openToTarget("home", "upcoming")).toBe("/upcoming");
    expect(openToTarget("pwa", "today")).toBe("/today");
    expect(openToTarget("home", null)).toBe("/today");
    expect(openToTarget(null, "inbox")).toBeNull();
    expect(openToTarget("push", "inbox")).toBeNull();
  });
});

describe("<OpenTo>", () => {
  it("the installed app's start URL goes on to Inbox when that is the choice", () => {
    window.history.replaceState(null, "", "/today?src=pwa");
    rows = [{ default_view: "inbox" }];
    render(<OpenTo />);
    expect(replace).toHaveBeenCalledWith("/inbox");
  });

  it("with Today chosen it stays and only drops the marker, keeping other parameters", () => {
    window.history.replaceState(null, "", "/today?src=home&quickadd=1");
    rows = [{ default_view: "today" }];
    render(<OpenTo />);
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.pathname + window.location.search).toBe("/today?quickadd=1");
  });

  it("waits for the settings row before deciding, and ignores an ordinary visit to Today", () => {
    window.history.replaceState(null, "", "/today?src=pwa");
    rows = [];
    render(<OpenTo />);
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?src=pwa");

    window.history.replaceState(null, "", "/today");
    rows = [{ default_view: "upcoming" }];
    render(<OpenTo />);
    expect(replace).not.toHaveBeenCalled();
  });
});
