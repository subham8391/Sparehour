// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { THEME_BOOTSTRAP } from "@/features/commands/theme-bootstrap";
import { applyLook, dayPart, DEFAULT_LOOK, isLookId, LOOK_KEY, LOOK_LINK_ID, readLook } from "./look";

const link = () => document.getElementById(LOOK_LINK_ID) as HTMLLinkElement | null;
const loaded = (el: HTMLLinkElement | null) => el?.dispatchEvent(new Event("load"));

afterEach(() => {
  localStorage.clear();
  link()?.remove();
  delete document.documentElement.dataset.look;
  delete document.documentElement.dataset.daypart;
});

describe("the look (DECISIONS.md, amendment 2026-10-20)", () => {
  it("adds a look's stylesheet and stamps it only once the sheet is in, so a switch never shows half a look", () => {
    applyLook("daylight");
    expect(link()?.getAttribute("href")).toMatch(/^\/looks\/daylight\.css\?v=/);
    expect(document.documentElement.dataset.look).toBeUndefined();
    loaded(link());
    expect(document.documentElement.dataset.look).toBe("daylight");
    expect(localStorage.getItem(LOOK_KEY)).toBe("daylight");
    expect(readLook()).toBe("daylight");
  });

  it("swaps one look for another, keeping the old sheet until the new one is in", () => {
    applyLook("daylight");
    loaded(link());
    applyLook("timetable");
    const sheets = document.querySelectorAll(`#${LOOK_LINK_ID}`);
    expect(sheets).toHaveLength(2);
    expect(document.documentElement.dataset.look).toBe("daylight");
    loaded(sheets[1] as HTMLLinkElement);
    expect(document.querySelectorAll(`#${LOOK_LINK_ID}`)).toHaveLength(1);
    expect(link()?.getAttribute("href")).toMatch(/timetable\.css/);
    expect(document.documentElement.dataset.look).toBe("timetable");
  });

  it("Sky is the default: it needs no sheet and nothing stored", () => {
    applyLook("daylight");
    loaded(link());
    applyLook(DEFAULT_LOOK);
    expect(link()).toBeNull();
    expect(document.documentElement.dataset.look).toBeUndefined();
    expect(localStorage.getItem(LOOK_KEY)).toBeNull();
    expect(readLook()).toBe(DEFAULT_LOOK);
  });

  it("refuses an id that is not a look's shape, the same rule the database checks", () => {
    expect(isLookId("color-field")).toBe(true);
    for (const bad of ["", "Sky", "../x", "a b", "x".repeat(25), "1a", null, 3]) expect(isLookId(bad), String(bad)).toBe(false);
    applyLook("../evil");
    expect(link()).toBeNull();
    localStorage.setItem(LOOK_KEY, "<script>");
    expect(readLook()).toBe(DEFAULT_LOOK);
  });

  it("names the part of the day the sky follows", () => {
    expect([4, 5, 11, 12, 16, 17, 20, 21, 0].map(dayPart)).toEqual(["night", "morning", "morning", "afternoon", "afternoon", "evening", "evening", "night", "night"]);
  });

  it("the head script stamps the stored look and its sheet before paint, render-blocking, and the part of the day", () => {
    localStorage.setItem(LOOK_KEY, "daylight");
    new Function(THEME_BOOTSTRAP)();
    expect(document.documentElement.dataset.look).toBe("daylight");
    expect(link()?.getAttribute("href")).toMatch(/^\/looks\/daylight\.css\?v=/);
    expect(link()?.getAttribute("blocking")).toBe("render");
    expect(document.documentElement.dataset.daypart).toBe(dayPart(new Date().getHours()));
  });

  it("the head script adds nothing for Sky or for a stored id of the wrong shape", () => {
    new Function(THEME_BOOTSTRAP)();
    expect(link()).toBeNull();
    localStorage.setItem(LOOK_KEY, "x/../../evil");
    new Function(THEME_BOOTSTRAP)();
    expect(link()).toBeNull();
    expect(document.documentElement.dataset.look).toBeUndefined();
  });
});
