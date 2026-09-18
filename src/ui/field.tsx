// Text inputs (DESIGN_SYSTEM.md §5): a line-control border that switches to
// ink on focus, so the global focus ring is turned off here and there is
// never a double ring. 16 px on the phone so iOS does not zoom, 14 px above.
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

export type FieldSize = "auto" | "touch" | "desktop";

const BASE = "w-full rounded-lg border border-line-control bg-surface px-3 text-base text-ink outline-none placeholder:text-ink-4 focus:border-ink focus-visible:outline-none disabled:opacity-60 sm:text-body";

const SIZE: Record<FieldSize, string> = {
  auto: "h-11 sm:h-9",
  touch: "h-11",
  desktop: "h-9",
};

export function fieldClass({ size = "auto" }: { size?: FieldSize } = {}): string {
  return cx(BASE, SIZE[size]);
}

export function Input({ size = "auto", className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: FieldSize }) {
  return <input className={cx(fieldClass({ size }), className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(BASE, "min-h-11 py-2 leading-5", className)} {...rest} />;
}
