// The lines Today says only on some days (SCREENS.md §2.1, §2.7, §19, §21; the web's are features/today/
// expired-digest.tsx, calendar-lines.tsx and day-states.tsx): the once-only expired digest, what the calendar needs
// (reconnecting, a place for blocks, a sync that failed), the note over a day that has passed, and the summary of a
// day that was shut down. Presentational: the words are handed in, already the web's own.
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { Icon } from "~/ui/icon";
import { MenuRow } from "~/ui/menu-row";
import { TARGET, font, useColours } from "~/ui/theme";

/** "2 time-sensitive tasks expired overnight", with Review (the Logbook, filtered to them) and a dismiss. Never red. */
export function ExpiredLine({ line, onReview, onDismiss }: { line: string; onReview: () => void; onDismiss: () => void }) {
  const c = useColours();
  return (
    <Card style={styles.line}>
      <Text accessibilityLiveRegion="polite" style={[styles.lineText, { color: c.ink2 }]}>
        {line}
      </Text>
      <Button variant="quiet" label="Review" onPress={onReview} />
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} style={styles.icon}>
        <Icon name="close" size={16} color={c.ink3} />
      </Pressable>
    </Card>
  );
}

/**
 * "Want a nudge when this starts?" (the web's block-nudge.tsx, its words): asked once after the first block made
 * here. A failure to turn reminders on takes its place, in words, until put away.
 */
export function BlockNudgeLine({ error, asking, onYes, onNotNow, onClose }: { error: string | null; asking: boolean; onYes: () => void; onNotNow: () => void; onClose: () => void }) {
  const c = useColours();
  if (error) {
    return (
      <Card style={styles.line}>
        <Text accessibilityRole="alert" style={[styles.lineText, { color: c.deadline }]}>
          {error}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onClose} style={styles.icon}>
          <Icon name="close" size={16} color={c.ink3} />
        </Pressable>
      </Card>
    );
  }
  return (
    <Card style={styles.line}>
      <Text accessibilityLiveRegion="polite" style={[styles.lineText, { color: c.ink2 }]}>
        Want a nudge when this starts?
      </Text>
      <Button variant="quiet" label="Yes" disabled={asking} onPress={onYes} />
      <Button variant="quiet" label="Not now" disabled={asking} onPress={onNotNow} />
    </Card>
  );
}

export interface CalendarLineProps {
  /** reauth: access lapsed or revoked; write_gone: the calendar blocks went to left Google; error: a sync failed. */
  kind: "reauth" | "write_gone" | "error";
  /** The line's first words, naming the account's calendar (features/today/calendar-state.ts `issueMessage`). */
  message: string;
  /** Blocking is paused until it is fixed. */
  blocking: boolean;
  /** write_gone: the calendars that can take blocks. */
  candidates?: readonly { id: string; name: string }[];
  /** error: the retry is on its way. */
  busy?: boolean;
  onReconnect?: () => void;
  onPick?: (calendarId: string) => void;
  onKeepLocal?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function CalendarLine(p: CalendarLineProps) {
  const c = useColours();
  if (p.kind === "error") {
    // Unreachable: the app keeps working from the last good sync; the line says so and can be put away.
    return (
      <Card style={styles.line}>
        <Text accessibilityLiveRegion="polite" style={[styles.lineText, { color: c.ink2 }]}>
          {p.message}
        </Text>
        {p.onRetry ? <Button variant="quiet" label={p.busy ? "Retrying…" : "Retry"} disabled={p.busy} onPress={p.onRetry} /> : null}
        {p.onDismiss ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss for now" onPress={p.onDismiss} style={styles.icon}>
            <Icon name="close" size={16} color={c.ink3} />
          </Pressable>
        ) : null}
      </Card>
    );
  }
  return (
    <Card style={styles.banner}>
      <Text accessibilityLiveRegion="polite" style={[styles.bannerTitle, { color: c.ink }]}>
        {p.message}
      </Text>
      {p.kind === "reauth" ? (
        <>
          {p.blocking ? <Text style={[styles.bannerText, { color: c.ink2 }]}>Blocking is paused until you reconnect. Your blocks stay here, marked not synced.</Text> : null}
          {p.onReconnect ? <Button label="Reconnect" onPress={p.onReconnect} style={styles.start} /> : null}
        </>
      ) : (
        <>
          <Text style={[styles.bannerText, { color: c.ink2 }]}>Blocking is paused until you choose where blocks go. Your blocks stay here, marked not synced.</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Write calendar">
            {(p.candidates ?? []).map((cal) => (
              <MenuRow key={cal.id} label={cal.name} onPress={() => p.onPick?.(cal.id)} />
            ))}
            <MenuRow label="Keep blocks in Sparehour only" onPress={() => p.onKeepLocal?.()} />
          </View>
        </>
      )}
    </Card>
  );
}

/** A day that has passed, above its blocks and what was finished on it: read-only. */
export function PastDayNote() {
  const c = useColours();
  return <Text style={[styles.past, { color: c.ink2 }]}>A day that has passed, as it was: what you finished, and its blocks and meetings.</Text>;
}

/** The day after its shutdown: what was finished, the rating, and the highlight (SCREENS.md §15). */
export function ClosedDay({ line, highlights }: { /** "Closed at 18:05 · 4 done · 3h 10m · rated 4/5" */ line: string; highlights: string | null }) {
  const c = useColours();
  return (
    <Card style={styles.closed}>
      <Text style={[styles.closedTitle, { color: c.ink }]}>That’s the day.</Text>
      <Text style={[styles.closedLine, { color: c.ink2 }]}>{line}</Text>
      {highlights ? <Text style={[styles.bannerText, { color: c.ink2 }]}>Worth it: {highlights}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 2, marginBottom: 10 },
  lineText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, paddingVertical: 10 },
  icon: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  banner: { paddingHorizontal: 16, paddingVertical: 14, gap: 8, marginBottom: 10 },
  bannerTitle: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  bannerText: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  start: { alignSelf: "flex-start" },
  past: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginHorizontal: 22, marginBottom: 10 },
  closed: { paddingHorizontal: 18, paddingVertical: 18, gap: 6, borderRadius: 20 },
  closedTitle: { fontFamily: font.displayMedium, fontSize: 20, lineHeight: 26 },
  closedLine: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
});
