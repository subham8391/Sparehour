// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { capacityFor } from "@/core/capacity";
import { REFERENCE_DAY, task } from "@/core/capacity/__fixtures__/reference-day";
import { localDate } from "@/core/time";
import { DayBar, ReadoutText } from "./capacity-bar";
import { dayReadout } from "./week";

const bar = (c: ReturnType<typeof capacityFor>, isToday = false) => render(<DayBar c={c} readout={dayReadout(c, isToday)} />).container.firstElementChild as HTMLElement;

describe("the 6 px day bar", () => {
  it("draws the day's meetings and blocks on the spare track, and nothing for ticks or cursors", () => {
    const el = bar(capacityFor({ ...REFERENCE_DAY, now: undefined }));
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveClass("h-1.5");
    expect(el.querySelectorAll('[data-segment="meeting"]')).toHaveLength(4);
    expect(el.querySelectorAll('[data-segment="block"]')).toHaveLength(3);
    // The standup, 09:15–09:30 on a 09:00–18:00 day: 15 minutes in, 15 minutes long.
    const standup = el.querySelector<HTMLElement>('[data-segment="meeting"]')!;
    expect(parseFloat(standup.style.left)).toBeCloseTo((15 / 540) * 100);
    expect(parseFloat(standup.style.width)).toBeCloseTo((15 / 540) * 100);
    expect(el.querySelector(".ribbon-ticks, [class*='border-dashed']")).toBeNull();
    expect(el.querySelector('[data-segment="over"]')).toBeNull();
  });

  it("an over day gets the hatched tail past its end, sized by what is over and never more than a fifth", () => {
    const over = bar(capacityFor({ ...REFERENCE_DAY, now: undefined, tasks: [...REFERENCE_DAY.tasks, task("deck", 240)] }));
    const tail = over.querySelector<HTMLElement>('[data-segment="over"]')!;
    expect(tail).toHaveClass("ribbon-over");
    expect(tail.style.width).toBe(`max(3px, ${(40 / 540) * 100}%)`);
    const wild = bar(capacityFor({ ...REFERENCE_DAY, now: undefined, tasks: [task("all-week", 3000)] }));
    expect(wild.querySelector<HTMLElement>('[data-segment="over"]')!.style.width).toBe("max(3px, 20%)");
  });

  it("a day without working hours is a flat grey track", () => {
    const off = bar(capacityFor({ ...REFERENCE_DAY, day: localDate("2026-09-19") }));
    expect(off).toHaveAttribute("data-bar", "off");
    expect(off).toHaveClass("bg-surface-2");
    expect(off.children).toHaveLength(0);
  });
});

describe("the readout", () => {
  it("spare in the spare role, over in the over role, no hours quiet; never the deadline red", () => {
    const text = (r: Parameters<typeof ReadoutText>[0]["readout"]) => render(<ReadoutText readout={r} />).container.firstElementChild as HTMLElement;
    expect(text({ kind: "spare", min: 200, text: "3h 20m spare" })).toHaveClass("text-spare");
    expect(text({ kind: "spare", min: 0, text: "0m spare" })).toHaveClass("text-ink-2");
    expect(text({ kind: "over", min: 40, text: "40m over" })).toHaveClass("text-over");
    expect(text({ kind: "off", min: 0, text: "no working hours" })).toHaveClass("text-ink-3");
    for (const el of document.querySelectorAll("span")) expect(el.className).not.toMatch(/deadline/);
  });
});
