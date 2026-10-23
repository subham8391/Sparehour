// A time field in the app's one format, "HH:MM" (DESIGN_SYSTEM.md §3; DECISIONS.md, amendment 2026-10-23). With
// a keyboard it is typed: a whole time ("14:30") saves as it is typed, a loose one ("930", "9.30", "21") when focus
// leaves or Enter is pressed, ↑/↓ move it by the step, and Alt+↓ or the clock opens the wheel. On a touch screen a
// tap opens the wheel (ui/time-wheel.tsx), never the keyboard: the phone's own picker was the one that could not
// be used. The wheel is fetched the first time it is wanted, so the shells carry only this field.
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { cx } from "./cx";
import { fieldClass, type FieldSize } from "./field";
import { Icon } from "./icons";

const loadWheel = () => import("./time-wheel");
const TimeWheel = lazy(() => loadWheel().then((m) => ({ default: m.TimeWheel })));
const preload = () => void loadWheel().catch(() => undefined);

const TOUCH = "(hover: none) and (pointer: coarse)";
const media = () => (typeof matchMedia === "function" ? matchMedia(TOUCH) : null);
const subscribe = (cb: () => void) => {
  const m = media();
  m?.addEventListener("change", cb);
  return () => m?.removeEventListener("change", cb);
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "930", "9:30", "09.30", "21", "9" → "HH:MM"; null for anything that is not a time of day. */
export function parseTime(text: string): string | null {
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?$/i.exec(text.trim());
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2] ?? 0)];
  return h < 24 && min < 60 ? `${pad(h)}:${pad(min)}` : null;
}

export function TimeField({
  size = "auto",
  value,
  onChange,
  step = 5,
  clearable = false,
  className,
  disabled,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "value" | "onChange" | "step"> & {
  size?: FieldSize;
  value: string;
  /** A whole "HH:MM", or "" when a clearable field is emptied. */
  onChange: (value: string) => void;
  /** Minutes between the wheel's rows and per ↑/↓. */
  step?: number;
  /** The field may be emptied (a task's time): the wheel offers "No time", and an empty box saves "". */
  clearable?: boolean;
}) {
  const touch = useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
  // Fetched once the page is idle, so the first tap opens it at once (and offline).
  useEffect(() => {
    if (typeof requestIdleCallback !== "function") return;
    const id = requestIdleCallback(preload, { timeout: 4000 });
    return () => cancelIdleCallback(id);
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  /** The wheel, open with the name it is shown under, or closed. */
  const [open, setOpen] = useState<string | null>(null);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  const set = (v: string) => {
    setText(v);
    if (v !== value) onChange(v);
  };
  // Focus left or Enter: a loose time is read and written out in full, an empty clearable box clears, anything else
  // goes back to what was saved.
  const commit = () => {
    const v = text.trim() === "" ? (clearable ? "" : null) : parseTime(text);
    if (v === null) setText(value);
    else set(v);
  };
  const nudge = (by: number) => {
    const base = parseTime(text) ?? value;
    if (!base) return;
    const t = (Number(base.slice(0, 2)) * 60 + Number(base.slice(3)) + by + 1440) % 1440;
    set(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  };
  // Named by its aria-label, or by its <label> (read when it opens, not while drawing).
  const openWheel = () => !disabled && setOpen(rest["aria-label"] ?? input.current?.labels?.[0]?.textContent?.trim() ?? "Time");
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (touch && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      openWheel();
    } else if (e.key === "Enter") {
      commit();
    } else if (e.key === "ArrowDown" && e.altKey) {
      e.preventDefault();
      openWheel();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      nudge(e.key === "ArrowUp" ? step : -step);
    }
  };
  const now = () => {
    const d = new Date();
    const t = Math.ceil((d.getHours() * 60 + d.getMinutes()) / step) * step;
    return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`;
  };

  return (
    <span className={cx("relative inline-flex w-24 shrink-0", className)} onPointerEnter={preload} onTouchStart={preload}>
      <input
        ref={input}
        type="text"
        inputMode={touch ? "none" : "numeric"}
        readOnly={touch}
        autoComplete="off"
        placeholder="--:--"
        value={text}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-keyshortcuts="Alt+ArrowDown"
        onFocus={preload}
        onClick={() => touch && openWheel()}
        onChange={(e) => {
          setText(e.target.value);
          // A whole time saves as it is typed; a partial one waits for the box to be left.
          if (/^\d{1,2}:\d{2}$/.test(e.target.value.trim())) {
            const v = parseTime(e.target.value);
            if (v && v !== value) onChange(v);
          }
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={cx(fieldClass({ size }), "num pr-8 touch:pr-3 touch:cursor-pointer")}
        {...rest}
      />
      {!disabled && (
        // The pointer's way to the wheel. Keyboards have Alt+↓ (announced on the box) and touch has the tap, so it is
        // left out of the tab order and the accessibility tree, and the box keeps its name to itself.
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          title="Choose on a wheel"
          onClick={openWheel}
          className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 transition-colors dur-fast hover:bg-hover hover:text-ink touch:hidden"
        >
          <Icon name="clock" size={15} />
        </button>
      )}
      {open !== null && (
        <Suspense fallback={null}>
          <TimeWheel
            label={open}
            value={parseTime(text) ?? (value || now())}
            step={step}
            clearable={clearable}
            onSet={(v) => {
              setOpen(null);
              set(v);
            }}
            onClose={() => setOpen(null)}
          />
        </Suspense>
      )}
    </span>
  );
}
