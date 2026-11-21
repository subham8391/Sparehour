// Which looks the picker shows (DECISIONS.md, amendments 2026-10-20 and 2026-11-14): the three it opens on, the
// person's own beside them, and the rest behind "More looks". The look the person arrived on, and any they try, stay
// in sight when the rest are folded away again, so the way back is one tap. The rule alone, free of the web's screen
// parts: the web's picker (look-picker.tsx) and the Android app's draw what this decides
// (docs/mobile/ANDROID_APP_SPEC.md §4.3).
import { useState } from "react";
import { readyLooks, shownLooks, type Look } from "./catalog";

export interface LookChoices {
  /** The looks on show now, in the catalogue's order. */
  looks: Look[];
  /** How many more "More looks" would show; 0 when there are none to fold away. */
  rest: number;
  /** Every look is on show. */
  open: boolean;
  /** The words on the button that opens and folds the rest. */
  moreLabel: string;
  toggle: () => void;
  /** A look was picked: it stays in sight from now on. */
  tried: (id: string) => void;
}

export function useLookChoices(value: string): LookChoices {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<readonly string[]>([value]);
  const keep = seen.includes(value) ? seen : [...seen, value];
  const rest = readyLooks().length - shownLooks(false, keep).length;
  return {
    looks: shownLooks(open, keep),
    rest,
    open,
    moreLabel: open ? "Fewer looks" : `More looks (${rest})`,
    toggle: () => setOpen((o) => !o),
    tried: (id) => setSeen((t) => (t.includes(id) ? t : [...t, id])),
  };
}
