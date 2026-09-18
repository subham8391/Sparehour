// Chips (DESIGN_SYSTEM.md §5): one family, 22 px, radius 6, tabular figures,
// never wrapping. Tone carries the meaning: a deadline is ember only when it
// is near, a project token is meet-soft, the done-by pill is the only spare
// chip, an unestimated task gets the dashed guess.
import type { HTMLAttributes, ReactNode } from "react";
import type { LocalDate } from "@/core/time";
import { cx } from "./cx";
import { Icon, type IconName } from "./icons";
import { deadlineWording } from "./relative-day";

export type ChipTone = "neutral" | "time" | "deadline" | "near" | "meet" | "over" | "spare" | "guess" | "block";
export type ChipSize = "md" | "sm" | "auto";

const BASE = "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border border-transparent font-medium num";

const SIZE: Record<ChipSize, string> = {
  md: "h-[22px] px-2 text-body-sm",
  // The phone meta line.
  sm: "h-5 px-1.5 text-label",
  // The task row: the phone meta size below `sm`, the desktop chip above.
  auto: "h-5 px-1.5 text-label sm:h-[22px] sm:px-2 sm:text-body-sm",
};

const TONE: Record<ChipTone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  time: "bg-surface-2 text-ink-2",
  deadline: "bg-surface-2 text-ink-2",
  near: "bg-deadline-soft text-deadline [&_svg]:text-deadline-fill",
  meet: "bg-meet-soft text-meet",
  over: "border-over-line bg-over-soft text-over",
  spare: "rounded-full border-spare-line bg-spare-soft text-spare font-semibold",
  guess: "border-dashed border-line-control text-ink-2",
  block: "bg-surface-2 text-ink font-semibold",
};

/** The glyph each tone carries when none is given. */
const TONE_ICON: Partial<Record<ChipTone, IconName>> = { time: "clock", deadline: "flag", near: "flag" };

export function chipClass({ tone = "neutral", size = "md" }: { tone?: ChipTone; size?: ChipSize } = {}): string {
  return cx(BASE, SIZE[size], TONE[tone]);
}

export function Chip({
  tone = "neutral",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone; size?: ChipSize; /** An icon name from the set, any node, or `null` to drop the tone's default glyph. */ icon?: IconName | ReactNode }) {
  const glyph = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <span className={cx(chipClass({ tone, size }), className)} {...rest}>
      {tone === "block" && <span aria-hidden="true" className="size-[7px] shrink-0 rounded-[1.5px] bg-ink" />}
      {typeof glyph === "string" ? <Icon name={glyph as IconName} size={size === "sm" ? 11 : 12} className="shrink-0" /> : glyph}
      {children}
    </span>
  );
}

/** A deadline as a chip: "Fri" or "22 Sep" in neutral, "Today" / "Tomorrow" / "2d late" in ember. */
export function DeadlineChip({ deadline, today, size, className }: { deadline: LocalDate; today: LocalDate; size?: ChipSize; className?: string }) {
  const { label, near } = deadlineWording(deadline, today);
  return (
    <Chip tone={near ? "near" : "deadline"} size={size} className={className}>
      {label}
    </Chip>
  );
}
