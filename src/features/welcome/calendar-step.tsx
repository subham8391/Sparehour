// Step 2, "Connect your calendar." (ONBOARDING.md §2, as the 2026-10-21 amendment changed what connecting asks for;
// in the first run since the 2026-11-14 amendment; Outlook beside Google since the 2026-11-15 one): the difference
// between a guess and a fact, so the copy says exactly what is read. Connecting asks only for the times a person is
// busy; meeting names and writing blocks stay the later choices they are in Settings. Skipping is a first-class
// path: the number then stands on the working hours alone. Each way to connect is a link, because it leaves for
// Google's or Microsoft's consent and comes back to /welcome with the outcome. Only the calendars this server can
// connect are offered. An island of the first run: it is fetched once the hours are on screen, not with them.
import type { ReactNode } from "react";
import { connectHref } from "@/features/calendar/providers";
import { Button, buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { FOOTER_BUTTON, WelcomeFrame } from "./welcome-frame";

/** Where "Connect Google Calendar" goes: the consent, then back here (api/calendar/google/start, `next`). */
export const CONNECT_HREF = connectHref("google", "/welcome");
/** Where "Connect Outlook" goes (api/calendar/microsoft/start). */
export const OUTLOOK_HREF = connectHref("microsoft", "/welcome");

/** What the consent's answer was, when it was not a connection (api/calendar/{google,microsoft}/callback). */
export type CalendarOutcome = "denied" | "error" | "no_read";

/** The one line said above the buttons after a connection that did not happen; the buttons stay (§2 Validation). */
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

/**
 * The second line where Outlook is offered. Microsoft has no permission for busy times alone: the one it has lets an
 * app read a meeting's name, so "we don't see" would not be true of it. What is true of both is what is kept.
 */
const KEPT = { lead: "We keep only the times.", rest: "No titles, no guests, no notes." };

export function CalendarStep({
  google = true,
  outlook = false,
  outcome = null,
  reason = null,
  onSkip,
}: {
  /** Which calendars this server can connect (api/calendar/config); the step is not shown where it can connect none. */
  google?: boolean;
  outlook?: boolean;
  outcome?: CalendarOutcome | null;
  reason?: string | null;
  onSkip: () => void;
}) {
  const note: ReactNode = outcome ? outcomeNote(outcome, reason) : null;
  const promises = outlook ? [PROMISES[0], KEPT, PROMISES[2]] : PROMISES;
  const connect = cx(buttonClass({ variant: "primary", size: "sheet" }), FOOTER_BUTTON);
  return (
    <WelcomeFrame
      title="Connect your calendar."
      lead="Your meetings are the reason you don't have as much time as you think. We subtract them."
      footer={
        <>
          <Button variant="secondary" size="sheet" className={FOOTER_BUTTON} onClick={onSkip}>
            Skip for now
          </Button>
          {outlook && (
            <a href={OUTLOOK_HREF} className={connect}>
              Connect Outlook
            </a>
          )}
          {google && (
            <a href={CONNECT_HREF} className={connect}>
              Connect Google Calendar
            </a>
          )}
        </>
      }
    >
      <ul className="flex flex-col gap-3">
        {promises.map((p) => (
          <li key={p.lead} className="text-body text-pretty text-ink-2">
            <strong className="font-semibold text-ink">{p.lead}</strong> {p.rest}
          </li>
        ))}
      </ul>
      {outlook && (
        <p className="text-body-sm text-pretty text-ink-2">
          With Outlook, Microsoft&rsquo;s screen asks to let Sparehour read your calendars. It has no narrower permission to ask for; the times are all we keep.
        </p>
      )}
      <p className="text-body-sm text-pretty text-ink-2">
        {/* The later choices are Google's: nothing more can be asked of Outlook yet, so nothing more is promised of it. */}
        Without it, the number uses your working hours alone.
        {google && (outlook ? " With Google Calendar, meeting names and time blocks on your calendar are yours to add later in Settings." : " Meeting names, and time blocks on your calendar, are yours to add later in Settings.")}{" "}
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
