// One weekday of Settings › Working hours while it is being edited (SCREENS.md §18, PRODUCT_SPEC.md §9.5): on or
// off, and its stretches. Every valid edit saves the whole day at once. Stretches may overlap while they are being
// set (the day counts them as one); when the person leaves the day they are joined, with a note. The rules alone,
// free of the web's screen parts: the web's row (sections/hours-section.tsx) and the Android app's day sheet draw
// what this decides (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { useState } from "react";
import { joinedNote } from "./section-words";
import { DEFAULT_SEGMENT, mergeSegments, nextSegment, segmentsError, segmentsLabel, segmentsOverlap, type Segment } from "./settings-rules";

export interface WorkDay {
  /** The day's stretches as they are being edited; the saved ones once they change underneath. */
  draft: Segment[];
  /** A working day: it has saved stretches. */
  on: boolean;
  /** What stops the draft being saved ("The day has to end after it starts."); null when it is saved as it stands. */
  error: string | null;
  /** The stretch "Add hours" would add; null when a third already exists or the day is full. */
  next: Segment | null;
  /** Said once overlapping stretches were joined. */
  note: string | null;
  /** Changes one stretch's start or end; saved when the day is valid. */
  edit: (index: number, part: Partial<Segment>) => void;
  remove: (index: number) => void;
  /** Adds `next`. */
  add: () => void;
  /** Makes the day a working day (its last stretches, or the default) or a day off. */
  toggle: (working: boolean) => void;
  /** The person left the day: overlapping stretches become one, and the day says so. */
  settle: () => void;
}

export function useWorkDay(segments: readonly Segment[], onChange: (segments: Segment[]) => void): WorkDay {
  const saved = segmentsLabel(segments);
  const [draft, setDraft] = useState<Segment[]>(segments.length > 0 ? [...segments] : [DEFAULT_SEGMENT]);
  const [seen, setSeen] = useState(saved);
  const [note, setNote] = useState<string | null>(null);
  if (seen !== saved) {
    setSeen(saved);
    if (segments.length > 0) setDraft([...segments]);
  }
  const on = segments.length > 0;
  const next = nextSegment(draft);

  const commit = (list: Segment[]) => {
    setDraft(list);
    setNote(null);
    if (!segmentsError(list)) onChange(list);
  };
  return {
    draft,
    on,
    error: on ? segmentsError(draft) : null,
    next,
    note,
    edit: (i, part) => commit(draft.map((s, j) => (j === i ? { ...s, ...part } : s))),
    remove: (i) => commit(draft.filter((_, j) => j !== i)),
    add: () => {
      if (next) commit([...draft, next]);
    },
    toggle: (working) => onChange(working ? (segmentsError(draft) ? [DEFAULT_SEGMENT] : mergeSegments(draft)) : []),
    settle: () => {
      if (!on || segmentsError(draft) || !segmentsOverlap(draft)) return;
      const merged = mergeSegments(draft);
      setDraft(merged);
      onChange(merged);
      setNote(joinedNote(merged));
    },
  };
}
