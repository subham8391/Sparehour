"use client";
// The pieces every Settings section is built from (SCREENS.md §18): a titled
// card with its inline "Saved", and the switch and number rows. Grouped
// cards, one row per setting with the label on the left and its control on
// the right (DESIGN_SYSTEM.md §4a "Settings"); on the phone a wide control
// wraps under its label.
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/ui/cx";
import { Input } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { ListCard } from "@/ui/list-card";
import { SectionLabel } from "@/ui/section-label";
import { Switch } from "@/ui/switch";
import { HINT, LABEL, ROW } from "./rows";

/** The "Saved" that follows a change for a second and a half. */
export function useSavedFlash(): [boolean, () => void] {
  const [at, setAt] = useState(0);
  const [hiddenAt, setHiddenAt] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = setTimeout(() => setHiddenAt(at), 1500);
    return () => clearTimeout(t);
  }, [at]);
  return [at !== 0 && hiddenAt !== at, () => setAt(Date.now())];
}

/** The "Saved" that follows a change: always in the tree so the live region exists before it speaks. */
export function SavedStatus({ on }: { on: boolean }) {
  return (
    <span role="status" aria-live="polite" className={cx("flex items-center gap-1 text-label font-medium text-ink-3 transition-opacity dur-fast", on ? "opacity-100" : "opacity-0")}>
      {on && (
        <>
          <Icon name="check" size={12} /> Saved
        </>
      )}
    </span>
  );
}

/**
 * One section's card under its label. On the phone the pushed-in section's title is the view's heading, so the
 * label keeps only the "Saved" there (the words stay for screen readers).
 */
export function Section({ id, title, saved, children, note }: { id?: string; title: string; /** Omitted for groups that do not save from here. */ saved?: boolean; children: ReactNode; /** A caption under the card. */ note?: ReactNode }) {
  return (
    <section id={id} aria-label={title} className="flex flex-col gap-2">
      <SectionLabel className="max-md:min-h-4" action={saved === undefined ? undefined : <SavedStatus on={saved} />}>
        <span className="max-md:sr-only">{title}</span>
      </SectionLabel>
      <ListCard as="div">{children}</ListCard>
      {note}
    </section>
  );
}

export function SwitchRow({ id, label, hint, checked, onChange, children }: { id: string; label: string; /** The second line under the label. */ hint?: ReactNode; checked: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  return (
    <div className={ROW}>
      {hint ? (
        <span className="flex min-w-0 flex-col">
          <label htmlFor={id} className={LABEL}>
            {label}
          </label>
          <span className={HINT}>{hint}</span>
        </span>
      ) : (
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
      )}
      <span className="flex items-center gap-3">
        {children}
        <Switch id={id} aria-label={label} checked={checked} onChange={onChange} />
      </span>
    </div>
  );
}

export function NumberRow({ id, label, unit, value, min, max, step, onChange }: { id: string; label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  // A local draft, so a half-typed number is not snapped back to the saved value mid-keystroke.
  const [draft, setDraft] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value));
  }
  return (
    <div className={ROW}>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <span className="flex items-center gap-2">
        <span className="w-24">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const v = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(v) && v >= min && v <= max) onChange(v);
            }}
            onBlur={() => setDraft(String(value))}
            className="num"
          />
        </span>
        <span className="text-body-sm text-ink-3">{unit}</span>
      </span>
    </div>
  );
}
