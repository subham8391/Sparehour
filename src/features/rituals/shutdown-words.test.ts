import { describe, expect, it } from "vitest";
import { SHUTDOWN_STEPS } from "./shutdown";
import { CARRY_CHOICE_LABEL, SHUTDOWN_LABELS, SHUTDOWN_TITLES, carryAnswers, highlightToSave, rateLabel, waitingCount } from "./shutdown-words";

describe("the shutdown's words", () => {
  it("names the six steps in their settled order", () => {
    expect(SHUTDOWN_LABELS).toEqual(["Done today", "Carried to tomorrow", "How was the day?", "What was worth it today?", "Tomorrow", "Close the day"]);
    expect(SHUTDOWN_STEPS.map((s) => SHUTDOWN_TITLES[s])).toEqual(SHUTDOWN_LABELS);
  });

  it("names a rating button and the four answers of a row", () => {
    expect(rateLabel(3)).toBe("Rate 3");
    expect(carryAnswers(null).map((c) => CARRY_CHOICE_LABEL[c])).toEqual(["Tomorrow", "Someday", "Drop", "Keep for today"]);
  });
});

describe("carryAnswers", () => {
  it("offers all four while a row waits", () => {
    expect(carryAnswers(null)).toEqual(["tomorrow", "someday", "drop", "keep"]);
  });

  it("keeps the three moves open on a row kept for today, which wrote nothing", () => {
    expect(carryAnswers("kept")).toEqual(["tomorrow", "someday", "drop"]);
  });

  it("offers nothing once a row is settled", () => {
    for (const outcome of ["tomorrow", "someday", "dropped", "done", "moved"] as const) expect(carryAnswers(outcome)).toEqual([]);
  });
});

describe("waitingCount", () => {
  it("counts the rows with no outcome yet", () => {
    expect(waitingCount([{ outcome: null }, { outcome: "kept" }, { outcome: null }, { outcome: "tomorrow" }])).toBe(2);
    expect(waitingCount([])).toBe(0);
  });
});

describe("highlightToSave", () => {
  it("is the typed line, trimmed", () => {
    expect(highlightToSave("  Shipped the deck ", "")).toBe("Shipped the deck");
  });

  it("is nothing when the line says what is saved already", () => {
    expect(highlightToSave("Shipped the deck ", "Shipped the deck")).toBeNull();
    expect(highlightToSave("   ", "")).toBeNull();
  });

  it("is an empty line when a saved highlight was cleared", () => {
    expect(highlightToSave("", "Shipped the deck")).toBe("");
  });
});
