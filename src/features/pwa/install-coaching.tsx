"use client";
// The iPhone and iPad install coaching (ONBOARDING.md §After the reveal,
// SCREENS.md §22 Install): Safari has no install prompt, so the card shows
// the gesture — Share, with its glyph, then Add to Home Screen, then Add —
// and the Apple rule. Settings › App shows it, and so does Settings ›
// Notifications, where reminders are turned on. Nothing shows once installed:
// the callers only render it for Safari outside the Home Screen app.
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { APPLE_RULE } from "./install";

/** A step with Safari's Share glyph drawn after its first "Share", so the button is recognised on sight. */
function withShareGlyph(step: string) {
  const at = step.indexOf("Share");
  if (at < 0) return step;
  const end = at + "Share".length;
  return (
    <>
      {step.slice(0, end)}
      <Icon name="share" size={15} className="mx-0.5 inline-block align-[-3px] text-ink" />
      {step.slice(end)}
    </>
  );
}

export function InstallCoaching({ steps, className }: { steps: readonly string[]; className?: string }) {
  return (
    <section aria-label="Add Sparehour to your Home Screen" className={cx("flex flex-col gap-2 rounded-lg bg-surface-2 px-3 py-3", className)}>
      <h3 className="text-body font-medium text-balance text-ink">Add Sparehour to your Home Screen</h3>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-body-sm text-pretty text-ink-2">
        {steps.map((s) => (
          <li key={s}>{withShareGlyph(s)}</li>
        ))}
      </ol>
      <p className="text-body-sm text-pretty text-ink-3">{APPLE_RULE}</p>
    </section>
  );
}
