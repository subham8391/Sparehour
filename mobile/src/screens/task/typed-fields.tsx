// The two typed boxes the detail's pickers open with (SCREENS.md §10 "As built"): a date in words ("next tue",
// "21 oct", "fri 3pm"), read by the web app's readTypedDate exactly as quick add reads it, and a length ("45",
// "1h 30m"), read by its parseLength. Each shows what it read under the box before it is set, and says so when it
// could not read the words, writing nothing. The wording under the box is the web's (features/tasks/detail-rules.ts).
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { readTypedDate, type TypedDate } from "@/core/quickadd/read-date";
import { formatMinutes, type Instant, type LocalDate } from "@/core/time";
import { parseLength } from "@/core/time/parse-length";
import { typedDateValue, typedDateWords } from "@/features/tasks/detail-rules";
import { Button } from "~/ui/button";
import { TextField } from "~/ui/text-field";
import { font, useColours } from "~/ui/theme";

/** A date typed in words; with `withTime` (the Do field) a time or "evening" is taken with it. */
export function TypedDateField({ now, zone, today, withTime = false, onApply }: { now: Instant; zone: string; today: LocalDate; withTime?: boolean; onApply: (d: TypedDate) => void }) {
  const c = useColours();
  const [text, setText] = useState("");
  const [missed, setMissed] = useState(false);
  const read = text.trim() ? readTypedDate(text, { now, zone, today }) : null;
  const commit = () => {
    if (read) onApply(typedDateValue(read, withTime));
    else if (text.trim()) setMissed(true);
  };
  return (
    <View>
      <View style={styles.row}>
        <TextField
          accessibilityLabel="In words"
          placeholder={withTime ? "next tue · 21 oct · fri 3pm" : "next tue · 21 oct · in 3 days"}
          value={text}
          onChangeText={(t) => {
            setText(t);
            setMissed(false);
          }}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={commit}
          style={styles.field}
        />
        <Button label="Set" accessibilityLabel="Set the day" onPress={commit} />
      </View>
      {missed || read ? (
        <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: c.ink2 }]}>
          {missed || !read ? "Didn't catch that" : `→ ${typedDateWords(read, today, withTime)}`}
        </Text>
      ) : null}
    </View>
  );
}

/** A length typed in: minutes ("150") or hours and minutes ("2h 30m", "1.5h", "2:30"), up to a day. */
export function LengthField({ onSubmit }: { onSubmit: (minutes: number) => void }) {
  const c = useColours();
  const [text, setText] = useState("");
  const [missed, setMissed] = useState(false);
  const read = parseLength(text);
  const commit = () => {
    if (read != null) onSubmit(read);
    else if (text.trim()) setMissed(true);
  };
  return (
    <View>
      <View style={styles.row}>
        <TextField
          accessibilityLabel="Length"
          placeholder="45 or 1h 30m"
          value={text}
          onChangeText={(t) => {
            setText(t);
            setMissed(false);
          }}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={commit}
          style={styles.field}
        />
        <Button label="Set" accessibilityLabel="Set the length" onPress={commit} />
      </View>
      {missed || read != null ? (
        <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: c.ink2 }]}>
          {missed || read == null ? "Type minutes, or hours like 1h 30m. Up to 24h." : `→ ${formatMinutes(read)}`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  field: { flex: 1 },
  hint: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginTop: 6, fontVariant: ["tabular-nums"] },
});
