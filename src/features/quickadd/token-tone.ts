// How a token reads in the quick-add line while it is typed (SCREENS.md §11 "Tokens are painted in place"). Tokens
// are told apart by weight of colour alone: a project is the meet token, everything else steps back to ink-2, a note
// to ink-3 (D11: no green, no ember in the box). The chips below the line carry the meaning. The rule alone, free of
// how it is drawn (quick-add.tsx paints it with classes in the browser), so the Android app's line is coloured by the
// same rule (docs/mobile/ANDROID_APP_SPEC.md §4.3). `segments` (interpret.ts) cuts the line into the runs to paint.
import type { Span } from "@/core/quickadd";

/** A colour of the look, by the name of its token: plain ink is how the title's own words are written. */
export type TokenTone = "ink" | "ink-2" | "ink-3" | "meet";

export const TOKEN_TONE: Record<Span["kind"], TokenTone> = {
  protected: "ink",
  literal: "ink",
  datetime: "ink-2",
  project: "meet",
  tag: "ink-2",
  estimate: "ink-2",
  priority: "ink-2",
  deadline: "ink-2",
  start: "ink-2",
  recurrence: "ink-2",
  evening: "ink-2",
  notes: "ink-3",
};
