// What the quick-add sheet says and offers, apart from how it is drawn: the token chips under the line, the notes
// on a parse, the words of the strip before there is anything to restate, and why a save failed. Its own module,
// free of the sheet's web parts (quick-add.tsx draws them in the browser), so the Android app's sheet offers the
// same tokens in the same words (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import type { Span } from "@/core/quickadd";

/** The token row (SCREENS.md §22): a tap writes the token into the line, so the syntax is learnt by using it. */
export const SUGGESTIONS: { label: string; insert: string }[] = [
  { label: "today", insert: "today" },
  { label: "tmrw", insert: "tomorrow" },
  { label: "evening", insert: "evening" },
  { label: "~15m", insert: "~15m" },
  { label: "~30m", insert: "~30m" },
  { label: "~45m", insert: "~45m" },
  { label: "~1h", insert: "~1h" },
  { label: "#project", insert: "#" },
  { label: "@tag", insert: "@" },
  { label: "!1", insert: "!1" },
];

/** The long example runs past the end of the box at 412 px, so the phone gets the short invitation. */
export const PLACEHOLDER = "Add a task — e.g. Draft proposal fri 3pm ~45m #acme !1";
export const PLACEHOLDER_NARROW = "Add a task…";

/** The spans a Backspace right after them, or a chip's remove control, can turn back into words. */
export const UNPARSEABLE: ReadonlySet<Span["kind"]> = new Set(["datetime", "evening", "estimate", "priority", "project", "tag", "deadline", "start", "recurrence"]);

/** A parse warning is a note, not a failure (PRODUCT_SPEC.md §5.4). */
export const WARNING_TEXT: Record<string, string> = {
  deadline_before_do_date: "Due before you plan to do it.",
  deadline_moved_to_first_occurrence: "The deadline was before the first repeat, so it moved to that day.",
  do_date_moved_to_start_date: "“after” sets when it starts, so the day became the start date.",
};

/** Under the box until the line has something to restate. */
export const STRIP_HINT = "Dates, times, ~estimates, #projects, @tags and !priority are understood.";

/** Tokens and no words (`tomorrow ~30m`): the save is blocked and the strip asks for a name (PRODUCT_SPEC.md §5.4). */
export const NEEDS_NAME = "Give it a name";

export const reason = (e: unknown) => (e instanceof Error && e.message ? e.message : "try again.");

/** Why a line was not saved; its words go back in the box. */
export const couldNotSave = (title: string, e: unknown) => `Couldn't save “${title}”: ${reason(e)}`;
