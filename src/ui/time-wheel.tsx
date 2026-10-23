"use client";
// The time wheel (DECISIONS.md, amendment 2026-10-23): two snapping columns, hours and minutes, under a large
// readout, with −15m, +15m and Now, in the shared sheet (a bottom sheet on a phone, a dialog above). A flick spins a
// column and it settles on a row, with a light tick on Android; a tap on a row picks it; the columns are spinbuttons,
// so the arrow keys, Page Up/Down, Home and End work, and typed digits ("1430") set the time. Loaded by TimeField
// the first time it opens, so no shell carries it.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "./button";
import { chipButtonClass } from "./chip";
import { cx } from "./cx";
import { EYEBROW } from "./section-label";
import { Sheet } from "./sheet";

/** One row: 44 px, a full touch target. Five rows show, the middle one is the value. */
const ROW = 44;
const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A tick as a row goes past under a finger: Android only (iOS has no web vibration), and only while the person spins. */
function tick() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(5);
}

function Wheel({ label, options, value, onChange }: { label: string; options: readonly number[]; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const index = Math.max(0, options.indexOf(value));
  const [live, setLive] = useState(index);
  const liveRef = useRef(index);
  /** The index this column settled on itself: the value coming back from it needs no scroll. */
  const own = useRef<number | null>(null);
  /** True while the column moves because the code moved it (opening, keys, chips, a tap): no ticks then. */
  const driven = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ready = useRef(false);

  // The value changed from outside the column (or the sheet opened): bring its row to the middle.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (own.current === index) {
      own.current = null;
      return;
    }
    driven.current = true;
    el.scrollTo?.({ top: index * ROW, behavior: !ready.current || reduced() ? "auto" : "smooth" });
    if (!el.scrollTo) el.scrollTop = index * ROW;
    ready.current = true;
  }, [index]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const at = () => Math.min(options.length - 1, Math.max(0, Math.round((ref.current?.scrollTop ?? 0) / ROW)));
  const settle = () => {
    clearTimeout(timer.current);
    const i = at();
    driven.current = false;
    if (options[i] !== value) {
      own.current = i;
      onChange(options[i]);
    }
  };
  const onScroll = () => {
    const i = at();
    if (i !== liveRef.current) {
      liveRef.current = i;
      setLive(i);
      if (!driven.current) tick();
    }
    // `scrollend` settles it where supported; the timer is the fallback.
    clearTimeout(timer.current);
    timer.current = setTimeout(settle, 140);
  };
  const step = (by: number) => onChange(options[Math.min(options.length - 1, Math.max(0, index + by))]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => void> = {
      ArrowUp: () => step(-1),
      ArrowDown: () => step(1),
      PageUp: () => step(-4),
      PageDown: () => step(4),
      Home: () => onChange(options[0]),
      End: () => onChange(options[options.length - 1]),
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  };

  return (
    <div
      ref={ref}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuetext={pad(value)}
      aria-valuemin={options[0]}
      aria-valuemax={options[options.length - 1]}
      onScroll={onScroll}
      onScrollEnd={settle}
      onKeyDown={onKeyDown}
      // Two empty rows above and below let the first and last values reach the middle; the edges fade out.
      style={{ paddingBlock: ROW * 2 }}
      className="relative z-1 h-[220px] w-20 snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-control [scrollbar-width:none] [mask-image:linear-gradient(to_bottom,transparent,black_32%,black_68%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-scrollbar]:hidden"
    >
      {options.map((o, i) => (
        <div
          key={o}
          onClick={() => onChange(o)}
          className={cx("flex h-11 cursor-pointer snap-center items-center justify-center text-[1.625rem] leading-none num transition-colors dur-fast", i === live ? "font-medium text-ink" : "text-ink-3")}
        >
          {pad(o)}
        </div>
      ))}
    </div>
  );
}

export function TimeWheel({
  label,
  value,
  step = 5,
  clearable = false,
  onSet,
  onClose,
}: {
  /** What is being set ("Monday start"); the sheet's name and its eyebrow. */
  label: string;
  /** "HH:MM", where the wheel opens. */
  value: string;
  /** Minutes between rows on the minute wheel; an off-step value it opens on is kept as a row of its own. */
  step?: number;
  /** Offer "No time", which sets the empty string. */
  clearable?: boolean;
  onSet: (value: string) => void;
  onClose: () => void;
}) {
  const [time, setTime] = useState(value);
  const [opened] = useState(value);
  const typed = useRef("");
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const startMinute = toMin(opened) % 60;
  const minutes = [...new Set([...Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step), startMinute])].sort((a, b) => a - b);
  const h = Math.floor(toMin(time) / 60);
  const m = toMin(time) % 60;
  const nudge = (by: number) => setTime(toHhmm((Math.round((toMin(time) + by) / step) * step + 1440) % 1440));
  const now = () => {
    const d = new Date();
    setTime(toHhmm((Math.round((d.getHours() * 60 + d.getMinutes()) / step) * step) % 1440));
  };
  // Digits typed anywhere in the sheet set the time as they come: "9" → 09:00, "93" → 09:30 is not a time yet,
  // "930" → 09:30, "1430" → 14:30. Enter sets it.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      onSet(time);
      return;
    }
    if (!/^\d$/.test(e.key) || e.metaKey || e.ctrlKey) return;
    typed.current = (typed.current + e.key).slice(-4);
    const d = typed.current;
    const [hh, mm] = d.length <= 2 ? [Number(d), 0] : [Number(d.slice(0, d.length - 2)), Number(d.slice(-2))];
    if (hh < 24 && mm < 60) setTime(`${pad(hh)}:${pad(mm)}`);
  };

  return (
    <Sheet label={`Choose ${label}`} onClose={onClose} width="sm" align="center" onKeyDown={onKeyDown}>
      <div className="flex flex-col gap-4 px-5 pt-3 pb-5 sm:px-6 sm:pt-5">
        <p className={EYEBROW}>{label}</p>
        <p aria-live="polite" className="-mt-1 text-center font-display text-[2.75rem] leading-none font-book text-ink num">
          {time}
        </p>
        <div className="relative flex items-center justify-center gap-1">
          {/* The band the middle row sits in, across both columns. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-[88px] h-11 rounded-control bg-surface-2" />
          <Wheel label="Hours" options={hours} value={h} onChange={(v) => setTime(`${pad(v)}:${pad(m)}`)} />
          <span aria-hidden="true" className="relative z-1 pb-1 text-[1.625rem] text-ink-3">
            :
          </span>
          <Wheel label="Minutes" options={minutes} value={minutes.includes(m) ? m : minutes.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a))} onChange={(v) => setTime(`${pad(h)}:${pad(v)}`)} />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className={chipButtonClass()} onClick={() => nudge(-15)}>
            −15m
          </button>
          <button type="button" className={chipButtonClass()} onClick={() => nudge(15)}>
            +15m
          </button>
          <button type="button" className={chipButtonClass()} onClick={now}>
            Now
          </button>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {clearable && (
            <Button variant="quiet" className="sm:mr-auto" onClick={() => onSet("")}>
              No time
            </Button>
          )}
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sheet" className="sm:h-9 sm:w-auto sm:text-body sm:touch:h-11" onClick={() => onSet(time)}>
            Set {time}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
