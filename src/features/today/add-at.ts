// "Add at 14:30" as arithmetic (DECISIONS.md, amendment 2026-11-21): the lengths the sheet offers and where the block
// ends. None of the sheet's drawing (add-at-sheet.tsx), so the Android app's sheet offers and writes the same
// minutes (docs/mobile/ANDROID_APP_SPEC.md §4).

const DAY_MIN = 24 * 60;
/** The lengths offered; a task's own length joins them when it is not one of these. */
export const ADD_LENGTHS: readonly number[] = [15, 30, 45, 60, 90, 120];
/** A block of your own starts at half an hour, as "New block here" always made it. */
export const OWN_MIN = 30;

/** A block ends on the day it starts: late in the evening a long one stops at midnight. */
export const addAtEnd = (at: number, minutes: number): number => Math.min(DAY_MIN, at + minutes);

/** The lengths to offer, shortest first, with the length chosen among them (a picked task's own). */
export const addAtLengths = (minutes: number): number[] => [...new Set([...ADD_LENGTHS, minutes])].sort((a, b) => a - b);
