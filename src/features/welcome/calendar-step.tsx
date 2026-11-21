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
import { CALENDAR_WORDS, calendarPromises, laterInSettings, outcomeNote, type CalendarOutcome } from "./welcome-words";

/** Where "Connect Google Calendar" goes: the consent, then back here (api/calendar/google/start, `next`). */
export const CONNECT_HREF = connectHref("google", "/welcome");
/** Where "Connect Outlook" goes (api/calendar/microsoft/start). */
export const OUTLOOK_HREF = connectHref("microsoft", "/welcome");

export { outcomeNote, type CalendarOutcome } from "./welcome-words";

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
  const promises = calendarPromises(outlook);
  const connect = cx(buttonClass({ variant: "primary", size: "sheet" }), FOOTER_BUTTON);
  return (
    <WelcomeFrame
      title={CALENDAR_WORDS.title}
      lead={CALENDAR_WORDS.lead}
      footer={
        <>
          <Button variant="secondary" size="sheet" className={FOOTER_BUTTON} onClick={onSkip}>
            {CALENDAR_WORDS.skip}
          </Button>
          {outlook && (
            <a href={OUTLOOK_HREF} className={connect}>
              {CALENDAR_WORDS.outlook}
            </a>
          )}
          {google && (
            <a href={CONNECT_HREF} className={connect}>
              {CALENDAR_WORDS.google}
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
          {CALENDAR_WORDS.outlookAsk}
        </p>
      )}
      <p className="text-body-sm text-pretty text-ink-2">
        {/* The later choices are Google's: nothing more can be asked of Outlook yet, so nothing more is promised of it. */}
        {CALENDAR_WORDS.without}
        {laterInSettings(google, outlook)}{" "}
        <a href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {CALENDAR_WORDS.privacy}
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
