// Buttons (DESIGN_SYSTEM.md §5): one scale, 36 px on desktop and 44 px on the
// phone and on any touch device (`touch:`, a pointer that cannot hover), five looks. Primary is ink in Sky, never green. Pressed scales to .97 only
// for people who have not asked for reduced motion. The focus ring is the
// global one and follows the radius. Corners, edges, the primary's colours and
// shadow, and the type follow the look (globals.css, "Controls"; DECISIONS.md):
// Studio's outlined green with a hard shadow, Material's tonal pill, Bauhaus's
// square blue. The destructive tone restates the colours rather than adding
// classes, so it wins whatever the look.
import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "link" | "icon";
/** `auto` is 44 px below `sm` and 36 px above; `compact` is the 28 px text action; `sheet` is the 48 px full-width primary in a phone sheet. */
export type ButtonSize = "auto" | "touch" | "desktop" | "compact" | "sheet";
/** `destructive` is the deadline role, for Delete and Disconnect only; Drop is undoable and stays ink (DESIGN_SYSTEM.md §2). */
export type ButtonTone = "default" | "destructive";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap text-body font-control transition-[background-color,color,border-color,transform] dur-fast motion-safe:active:scale-97 disabled:pointer-events-none disabled:opacity-60";

const VARIANT: Record<ButtonVariant, string> = {
  // `btn-fill` and `btn-line` (globals.css) draw the look's two buttons; `control-type` sets its face, case and tracking.
  primary: "btn-fill control-type rounded-control px-3.5",
  secondary: "btn-line control-type rounded-control px-3.5 hover:bg-hover",
  quiet: "rounded-control px-3.5 text-ink-2 hover:bg-hover hover:text-ink",
  // The text button: ink, no border, a hover wash. Pair with `text-ink-2` for the quieter one.
  link: "rounded-sm px-2 text-ink hover:bg-hover",
  // A glyph on its own: a square target with no label and the quiet wash. The size comes from the scale, so it is 44 px on touch.
  icon: "aspect-square rounded-control text-ink-2 hover:bg-hover hover:text-ink",
};

const SIZE: Record<ButtonSize, string> = {
  auto: "h-11 sm:h-9 touch:h-11",
  touch: "h-11",
  desktop: "h-9 touch:h-11",
  // The 28 px action beside a label or a row ("Clear the slate"), still 44 px on touch.
  compact: "h-11 px-2 text-body-sm sm:h-7 touch:h-11",
  sheet: "h-12 w-full text-body-lg",
};

// Deadline text with a deadline-soft wash. Primary and secondary restate the look's button variables (`btn-danger`);
// the others' tokens are declared after the neutrals, so they win over the variant's colours.
const DESTRUCTIVE: Record<ButtonVariant, string> = {
  primary: "btn-danger",
  secondary: "btn-danger hover:bg-deadline-soft",
  quiet: "text-deadline hover:bg-deadline-soft hover:text-deadline",
  link: "text-deadline hover:bg-deadline-soft",
  icon: "text-deadline hover:bg-deadline-soft hover:text-deadline",
};

/** The class string alone, for a `Link` or a `label` that should look like a button. */
export function buttonClass({
  variant = "secondary",
  size = "auto",
  tone = "default",
  block = false,
}: { variant?: ButtonVariant; size?: ButtonSize; tone?: ButtonTone; block?: boolean } = {}): string {
  return cx(BASE, VARIANT[variant], SIZE[size], tone === "destructive" && DESTRUCTIVE[variant], block && "w-full");
}

/** An icon-only button's classes: a square, 44 px on touch and 36 px above, for a `Link` or a `label`. */
export function iconButtonClass({ size = "auto", tone = "default" }: { size?: ButtonSize; tone?: ButtonTone } = {}): string {
  return buttonClass({ variant: "icon", size, tone });
}

export function Button({
  variant = "secondary",
  size = "auto",
  tone = "default",
  block = false,
  type = "button",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; tone?: ButtonTone; block?: boolean }) {
  return <button type={type} className={cx(buttonClass({ variant, size, tone, block }), className)} {...rest} />;
}
