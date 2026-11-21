"use client";
// Settings › Appearance › Look (DECISIONS.md, amendment 2026-10-20): a radio group of small previews, each drawn
// from the look's swatches in the theme on screen, so a person sees what they get before the stylesheet loads.
// Native radios underneath: arrows move through the looks and the group is one tab stop. It opens on three looks
// (amendment 2026-11-14) with the person's own beside them when it is another; "More looks" shows the rest.
import { useEffect, useId, useState } from "react";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import type { Swatch } from "./catalog";
import { useLookChoices } from "./look-choices";

/** Whether the page is drawn dark right now: an explicit choice, or the device's when none is stamped. */
function useDrawnDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const read = () => setDark(root.dataset.theme ? root.dataset.theme === "dark" : Boolean(media?.matches));
    read();
    media?.addEventListener?.("change", read);
    const watch = new MutationObserver(read);
    watch.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      media?.removeEventListener?.("change", read);
      watch.disconnect();
    };
  }, []);
  return dark;
}

function Preview({ s }: { s: Swatch }) {
  return (
    <span aria-hidden="true" className="flex aspect-[4/3] w-full items-end overflow-hidden rounded-lg p-2" style={{ background: s.page }}>
      <span className="flex w-full flex-col gap-1.5 rounded-md p-2" style={{ background: s.card, color: s.ink, boxShadow: `0 0 0 1px ${s.ink}1f` }}>
        <span className="text-body-sm leading-none font-bold num">7h 10m</span>
        <span className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: `${s.ink}26` }}>
          <span className="block h-full w-2/3 rounded-full" style={{ background: s.spare, marginLeft: "33%" }} />
        </span>
      </span>
    </span>
  );
}

export function LookPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const dark = useDrawnDark();
  // Which looks are on show, and which stay in sight once tried, is the picker's own rule (look-choices.ts), shared
  // with the Android app.
  const { looks, rest, open, moreLabel, toggle, tried } = useLookChoices(value);
  const pick = (id: string) => {
    tried(id);
    onChange(id);
  };
  const groupId = useId();
  return (
    <div className="flex flex-col items-start gap-2">
      <fieldset id={groupId} className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <legend className="sr-only">Look</legend>
        {looks.map((look) => {
          const on = look.id === value;
          return (
            <label key={look.id} className={cx("group relative flex cursor-pointer flex-col gap-1.5 rounded-xl p-1.5 transition-colors dur-fast hover:bg-hover", on && "bg-hover")}>
              <input type="radio" name="look" value={look.id} checked={on} onChange={() => pick(look.id)} className="peer sr-only" aria-describedby={`look-feel-${look.id}`} />
              <span className={cx("rounded-[calc(var(--radius-lg)+2px)] p-0.5 ring-2", on ? "ring-ink" : "ring-transparent peer-focus-visible:ring-ink")}>
                <Preview s={dark ? look.dark : look.light} />
              </span>
              <span className="flex items-center gap-1.5 px-0.5 text-body-sm font-medium text-ink">
                {look.name}
                {on && <Icon name="check" size={14} />}
              </span>
              <span id={`look-feel-${look.id}`} className="-mt-1 px-0.5 text-label text-pretty text-ink-3">
                {look.feel}
              </span>
            </label>
          );
        })}
      </fieldset>
      {rest > 0 && (
        <Button variant="link" aria-expanded={open} aria-controls={groupId} onClick={toggle}>
          {moreLabel}
        </Button>
      )}
    </div>
  );
}
