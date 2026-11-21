// Step 2, "Connect your calendar.", as the phone draws it (ONBOARDING.md §2; SCREENS.md §23 "As built, the calendar
// step with Outlook"; the web's is features/welcome/calendar-step.tsx): what connecting reads and what it does not,
// in the web's own words (features/welcome/welcome-words.ts), then the buttons stacked at the bottom: Skip for now
// first, then each calendar this server can connect, both filled. Skipping is a first-class path. A connection that
// did not happen is said in one line above the buttons, which stay. Presentational: connecting itself (the consent in
// the phone's browser and back) is handed in.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CALENDAR_WORDS, calendarPromises, laterInSettings, outcomeNote, type CalendarOutcome } from "@/features/welcome/welcome-words";
import { Button } from "~/ui/button";
import { TARGET, font, useColours } from "~/ui/theme";
import { StepLine, WelcomeFrame } from "./welcome-frame";

export interface CalendarStepViewProps {
  /** Which calendars this server can connect; the step is not shown where it can connect none. */
  google?: boolean;
  outlook?: boolean;
  /** What the last try came back with, when it was not a connection. */
  outcome?: CalendarOutcome | null;
  reason?: string | null;
  /** A connect is on its way: the buttons wait. */
  busy?: boolean;
  onSkip: () => void;
  onConnect: (provider: "google" | "microsoft") => void;
  /** Opens "What we store, in plain English". */
  onPrivacy: () => void;
}

export function CalendarStepView({ google = true, outlook = false, outcome = null, reason = null, busy = false, onSkip, onConnect, onPrivacy }: CalendarStepViewProps) {
  const c = useColours();
  const note = outcome ? outcomeNote(outcome, reason) : null;
  return (
    <WelcomeFrame
      title={CALENDAR_WORDS.title}
      lead={CALENDAR_WORDS.lead}
      footer={
        <>
          <Button block label={CALENDAR_WORDS.skip} disabled={busy} onPress={onSkip} />
          {outlook ? <Button variant="primary" block label={CALENDAR_WORDS.outlook} disabled={busy} onPress={() => onConnect("microsoft")} /> : null}
          {google ? <Button variant="primary" block label={CALENDAR_WORDS.google} disabled={busy} onPress={() => onConnect("google")} /> : null}
        </>
      }
    >
      <View style={styles.promises}>
        {calendarPromises(outlook).map((p) => (
          <Text key={p.lead} style={[styles.promise, { color: c.ink2 }]}>
            <Text style={[styles.strong, { color: c.ink }]}>{p.lead}</Text> {p.rest}
          </Text>
        ))}
      </View>
      {outlook ? <Text style={[styles.small, { color: c.ink2 }]}>{CALENDAR_WORDS.outlookAsk}</Text> : null}
      <View>
        <Text style={[styles.small, { color: c.ink2 }]}>
          {CALENDAR_WORDS.without}
          {laterInSettings(google, outlook)}
        </Text>
        {/* The web's link sits in the sentence; here it is a line of its own, so it is a whole target. */}
        <Pressable accessibilityRole="link" accessibilityLabel={CALENDAR_WORDS.privacy} onPress={onPrivacy} style={styles.privacy}>
          <Text style={[styles.small, styles.link, { color: c.ink2 }]}>{CALENDAR_WORDS.privacy}</Text>
        </Pressable>
      </View>
      {note ? <StepLine text={note} tone="ink" /> : null}
    </WelcomeFrame>
  );
}

const styles = StyleSheet.create({
  promises: { gap: 12 },
  promise: { fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  strong: { fontFamily: font.semibold },
  small: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  link: { textDecorationLine: "underline" },
  privacy: { minHeight: TARGET, justifyContent: "center", alignSelf: "flex-start" },
});
