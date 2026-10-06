// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn().mockResolvedValue(undefined);
const state: { expired: { expired_at: string | null }[]; seen: string | null } = { expired: [], seen: null };

vi.mock("@/data/powersync", () => ({
  useQuery: (sql: string) => ({
    data: sql.includes("from user_settings") ? [{ id: "settings1", expired_seen_at: state.seen, auto_filed_seen_at: null }] : state.expired,
    isLoading: false,
  }),
  useLocalDatabase: () => ({ execute }),
}));

import ExpiredDigest from "./expired-digest";

describe("<ExpiredDigest> (PRODUCT_SPEC.md §8.2 rule 5)", () => {
  beforeEach(() => {
    execute.mockClear();
    state.seen = null;
    state.expired = [{ expired_at: "2026-10-06 03:00:00.25+00" }, { expired_at: "2026-10-06T03:00:00.250Z" }];
  });

  it("says once how many time-sensitive tasks expired, with Review into the Logbook and a dismiss that is remembered", async () => {
    const user = userEvent.setup();
    render(<ExpiredDigest />);
    expect(screen.getByRole("status")).toHaveTextContent("2 time-sensitive tasks expired overnight");
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/logbook?show=expired");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(String(execute.mock.calls[0][0])).toBe("update user_settings set expired_seen_at = ?, updated_at = ? where id = ?");
    expect(execute.mock.calls[0][1][0]).toBe("2026-10-06T03:00:00.25Z");
    expect(execute.mock.calls[0][1][2]).toBe("settings1");
  });

  it("reads in the singular for one", () => {
    state.expired = [{ expired_at: "2026-10-06 03:00:00+00" }];
    render(<ExpiredDigest />);
    expect(screen.getByRole("status")).toHaveTextContent("1 time-sensitive task expired overnight");
  });

  it("says nothing when none expired, or once the batch has been seen", () => {
    state.seen = "2026-10-06T03:00:00.25Z";
    const { container, rerender } = render(<ExpiredDigest />);
    expect(container).toBeEmptyDOMElement();
    state.expired = [];
    state.seen = null;
    rerender(<ExpiredDigest />);
    expect(container).toBeEmptyDOMElement();
  });
});
