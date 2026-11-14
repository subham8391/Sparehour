// Step 2, "Connect your calendar." (ONBOARDING.md §2, as the 2026-10-21 amendment changed what connecting asks for;
// in the first run since the 2026-11-14 amendment): the difference between a guess and a fact, so the copy says
// exactly what is read. Connecting asks Google only for the times a person is busy, which brings no warning screen;
// meeting names and writing blocks stay the later choices they are in Settings. Skipping is a first-class path: the
// number then stands on the working hours alone. The primary is a link, because it leaves for Google's consent and
// comes back to /welcome with the outcome.
import type { ReactNode } from "react";
import { Button, buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { FOOTER_BUTTON, WelcomeFrame } from "./welcome-frame";

/** Where "Connect Google Calendar" goes: the consent, then back here (api/calendar/google/start, `next`). */
export const CONNECT_HREF = `/api/calendar/google/start?next=${encodeURIComponent("/welcome")}`;

/** What Google's answer was, when it was not a connection (api/calendar/google/callback). */
export type CalendarOutcome = "denied" | "error" | "no_read";

/** The one line said above the buttons after a connection that did not happen; both buttons stay (§2 Validation). */
export function outcomeNote(outcome: CalendarOutcome, reason: string | null): string {
  if (outcome === "denied") return "No problem. You can connect later from Settings.";
  if (outcome === "no_read") return "Google didn't share your busy times, so nothing was connected. Try again, or skip for now.";
  return reason?.trim() || "Google didn't answer. Try again.";
}

const PROMISES: readonly { lead: string; rest: string }[] = [
  { lead: "We read when you're busy.", rest: "Only the times, so the spare-time number is real." },
  { lead: "We don't see what your meetings are.", rest: "No titles, no guests, no notes." },
  { lead: "We don't change anything.", rest: "Nothing is added, moved or deleted." },
];

export function CalendarStep({ outcome = null, reason = null, onSkip }: { outcome?: CalendarOutcome | null; reason?: string | null; onSkip: () => void }) {
  const note: ReactNode = outcome ? outcomeNote(outcome, reason) : null;
  return (
    <WelcomeFrame
      title="Connect your calendar."
      lead="Your meetings are the reason you don't have as much time as you think. We subtract them."
      footer={
        <>
          <Button variant="secondary" size="sheet" className={FOOTER_BUTTON} onClick={onSkip}>
            Skip for now
          </Button>
          <a href={CONNECT_HREF} className={cx(buttonClass({ variant: "primary", size: "sheet" }), FOOTER_BUTTON)}>
            Connect Google Calendar
          </a>
        </>
      }
    >
      <ul className="flex flex-col gap-3">
        {PROMISES.map((p) => (
          <li key={p.lead} className="text-body text-pretty text-ink-2">
            <strong className="font-semibold text-ink">{p.lead}</strong> {p.rest}
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-pretty text-ink-2">
        Without it, the number uses your working hours alone. Meeting names, and time blocks on your calendar, are yours to add later in Settings.{" "}
        <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          What we store, in plain English
        </a>
      </p>
      {note && (
        <p role="status" className="text-body-sm text-pretty text-ink">
          {note}
        </p>
      )}
    </WelcomeFrame>
  );
}
