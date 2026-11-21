// A task from the older Logbook, as it was (SCREENS.md §8; the web's features/finished/finished-peek.tsx): it is not
// on the device, so it is shown read-only from the server's row, with Reopen, which makes it a task again (one
// finished day of a repeat has none). Delete for good removes the row from the server. There is no undo, so it asks
// once, in place: the buttons give way to "Delete for good? This cannot be undone." with Keep and Delete, and only
// that Delete is in the destructive tone. The sheet closes on the server's word alone; anything else is said here
// and nothing is removed. Presentational: the delete itself is handed in.
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import type { LocalDate } from "@/core/time";
import type { FinishedRow } from "@/features/finished/finished";
import type { FinishedDeleted } from "@/features/finished/finished-delete";
import { DELETE_WAIT_MS, finishedFacts, finishedWhen } from "@/features/finished/finished-words";
import { Button } from "~/ui/button";
import { Chip } from "~/ui/chip";
import { Icon } from "~/ui/icon";
import { Sheet } from "~/ui/sheet";
import { font, useColours } from "~/ui/theme";

export interface FinishedPeekProps {
  /** The row being shown; null when the sheet is closed. */
  row: FinishedRow | null;
  projectName?: string | null;
  tagNames?: readonly string[];
  zone: string;
  today?: LocalDate;
  /** Absent for a repeat's occurrence. */
  onReopen?: () => void;
  /** Asks the server to delete the row; it throws when the server could not be reached or did not say. */
  onDelete: (signal: AbortSignal) => Promise<FinishedDeleted>;
  /** The row is gone from the server (deleted now, or found already gone): take it off the list and close. */
  onDeleted: () => void;
  onClose: () => void;
}

export function FinishedPeek(p: FinishedPeekProps) {
  const [deleting, setDeleting] = useState(false);
  return (
    // While the delete is on its way the sheet stays, to say how it went.
    <Sheet open={p.row !== null} onClose={deleting ? () => undefined : p.onClose}>
      {p.row ? <Body key={p.row.id} {...p} row={p.row} onDeleting={setDeleting} /> : null}
    </Sheet>
  );
}

function Body({ row, projectName, tagNames = [], zone, today, onReopen, onDelete, onDeleted, onClose, onDeleting }: FinishedPeekProps & { row: FinishedRow; onDeleting: (deleting: boolean) => void }) {
  const c = useColours();
  // Delete for good: asked for, then confirmed. Nothing leaves the server before the second press.
  const [stage, setStage] = useState<"idle" | "asking" | "deleting">("idle");
  // Why the last try removed nothing, in plain words.
  const [failed, setFailed] = useState<string | null>(null);
  const deleting = stage === "deleting";
  const to = (next: "idle" | "asking" | "deleting") => {
    setStage(next);
    onDeleting(next === "deleting");
  };
  const keep = () => {
    setFailed(null);
    to("idle");
  };
  const remove = async () => {
    to("deleting");
    setFailed(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELETE_WAIT_MS);
    try {
      if ((await onDelete(controller.signal)) === "unavailable") {
        setFailed("Couldn’t delete it. Older tasks can’t be deleted here yet, so nothing was removed.");
        to("idle");
        return;
      }
      // Deleted now, or already gone (another device deleted or reopened it): either way it is no longer a finished task.
      onDeleting(false);
      onDeleted();
    } catch {
      setFailed("Couldn’t delete it. Check the connection and try again.");
      to("asking");
    } finally {
      clearTimeout(timer);
    }
  };
  const when = finishedWhen(row.completed_at, zone, today);
  const facts = finishedFacts(row, projectName, today);
  const steps = row.checklist ?? [];
  return (
    <>
      <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
        {row.title || "Untitled"}
      </Text>
      {when ? (
        <View style={styles.when}>
          <Icon name="check" size={14} color={c.ink3} />
          <Text style={[styles.small, { color: c.ink2 }]}>Finished {when}</Text>
        </View>
      ) : null}
      {facts.length > 0 ? <Text style={[styles.small, { color: c.ink2 }]}>{facts.join(" · ")}</Text> : null}
      {row.occurrence_of ? <Text style={[styles.small, { color: c.ink3 }]}>One day of a repeating task.</Text> : null}
      {tagNames.length > 0 ? (
        <View accessibilityLabel="Tags" style={styles.tags}>
          {tagNames.map((name) => (
            <Chip key={name} label={`@${name}`} />
          ))}
        </View>
      ) : null}
      {steps.length > 0 ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.label, { color: c.ink3 }]}>
            STEPS
          </Text>
          {steps.map((s, i) => (
            <View key={i} accessible accessibilityLabel={`${s.title} (${s.done ? "done" : "not done"})`} style={styles.step}>
              {s.done ? <Icon name="check" size={14} color={c.ink3} /> : <View style={[styles.stepRing, { borderColor: c.lineControl }]} />}
              <Text style={[styles.body, { color: s.done ? c.ink : c.ink2 }]}>{s.title}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {row.notes_md ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" style={[styles.label, { color: c.ink3 }]}>
            NOTE
          </Text>
          <Text style={[styles.body, { color: c.ink }]}>{row.notes_md}</Text>
        </View>
      ) : null}
      {failed ? (
        <Text accessibilityRole="alert" style={[styles.small, { color: c.ink2 }]}>
          {failed}
        </Text>
      ) : null}
      {stage === "idle" ? (
        // The three stack, with Delete for good last.
        <View style={styles.buttons}>
          {onReopen ? <Button variant="primary" block label="Reopen" onPress={onReopen} /> : null}
          <Button block label="Close" onPress={onClose} />
          <Button
            variant="quiet"
            block
            label="Delete for good"
            onPress={() => {
              setFailed(null);
              to("asking");
            }}
          />
        </View>
      ) : (
        // The question takes the buttons' place.
        <View style={styles.buttons}>
          <Text style={[styles.body, { color: c.ink }]}>Delete for good? This cannot be undone.</Text>
          <Button variant="primary" destructive block label={deleting ? "Deleting…" : "Delete"} disabled={deleting} onPress={() => void remove()} />
          <Button block label="Keep" disabled={deleting} onPress={keep} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.displayMedium, fontSize: 22, lineHeight: 28 },
  when: { flexDirection: "row", alignItems: "center", gap: 6 },
  small: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  section: { gap: 6, marginTop: 6 },
  label: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3 },
  step: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepRing: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, marginHorizontal: 1 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23, flexShrink: 1 },
  buttons: { gap: 8, marginTop: 10 },
});
