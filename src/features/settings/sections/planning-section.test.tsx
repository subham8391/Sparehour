// @vitest-environment jsdom
// Settings › Planning: under the default estimate, what tasks finished without one really took, with the one tap
// that makes it the default (DECISIONS.md, amendment 2026-11-15).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Learned } from "@/core/estimates";
import { SETTINGS_VALUES, WORK_WEEK } from "@/test/settings";
import type { SettingsFormProps } from "../types";

const h = vi.hoisted(() => ({ learned: null as Learned | null }));
vi.mock("@/features/estimates/use-learned", () => ({ useLearned: () => h.learned }));

const { PlanningSection } = await import("./planning-section");

function setup() {
  const onChange = vi.fn();
  const props = { values: { ...SETTINGS_VALUES, defaultEstimateMin: 30 }, workHours: WORK_WEEK, detectedTimeZone: null, account: { name: "Dev User", email: "dev@sparehour.local" }, onChange, onWorkHours: vi.fn(), onSignOut: vi.fn() } as unknown as SettingsFormProps;
  render(<PlanningSection {...props} />);
  return { onChange, user: userEvent.setup() };
}

beforeEach(() => {
  h.learned = null;
});

describe("Settings › Planning and the learned default", () => {
  it("says nothing until enough unestimated tasks were finished with a length", () => {
    setup();
    expect(screen.queryByText(/without an estimate/)).not.toBeInTheDocument();
  });

  it("says what they took and Use makes it the default", async () => {
    h.learned = { estimated: {}, unestimated: { n: 8, minutes: 45 }, projects: {} };
    const { user, onChange } = setup();
    expect(screen.getByText("Tasks you finished without an estimate usually took 45m.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use 45m" }));
    expect(onChange).toHaveBeenCalledWith({ defaultEstimateMin: 45 });
  });

  it("says nothing when the default is already about that", () => {
    h.learned = { estimated: {}, unestimated: { n: 8, minutes: 35 }, projects: {} };
    setup();
    expect(screen.queryByText(/without an estimate/)).not.toBeInTheDocument();
  });
});
