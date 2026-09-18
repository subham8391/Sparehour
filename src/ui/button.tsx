// Buttons (DESIGN_SYSTEM.md §5): one scale, 36 px on desktop and 44 px on the
// phone, four looks. Primary is ink, never green. Pressed scales to .97 only
// for people who have not asked for reduced motion. The focus ring is the
// global one and follows the radius.
import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "link";
/** `auto` is 44 px below `sm` and 36 px above; `sheet` is the 48 px full-width primary in a phone sheet. */
export type ButtonSize = "auto" | "touch" | "desktop" | "sheet";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-body font-medium transition-[background-color,color,border-color,transform] dur-fast motion-safe:active:scale-97 disabled:pointer-events-none disabled:opacity-60";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ink px-3.5 text-ink-inverse hover:bg-ink/90",
  secondary: "border border-line-strong bg-surface px-3.5 text-ink hover:bg-hover",
  quiet: "px-3.5 text-ink-2 hover:bg-hover hover:text-ink",
  // The text button: ink, no border, a hover wash. Pair with `text-ink-2` for the quieter one.
  link: "rounded-sm px-2 text-ink hover:bg-hover",
};

const SIZE: Record<ButtonSize, string> = {
  auto: "h-11 sm:h-9",
  touch: "h-11",
  desktop: "h-9",
  sheet: "h-12 w-full text-body-lg",
};

/** The class string alone, for a `Link` or a `label` that should look like a button. */
export function buttonClass({ variant = "secondary", size = "auto", block = false }: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean } = {}): string {
  return cx(BASE, VARIANT[variant], SIZE[size], block && "w-full");
}

export function Button({
  variant = "secondary",
  size = "auto",
  block = false,
  type = "button",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }) {
  return <button type={type} className={cx(buttonClass({ variant, size, block }), className)} {...rest} />;
}
