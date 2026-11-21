// Clear the slate as the phone draws it (PRODUCT_SPEC.md §8.5; the web's is the sheet
// features/archive/clear-slate-sheet.tsx, here a screen of its own, opened from Today's ⋯, the Carried over
// header and Settings › Data): the two scopes with how many tasks each takes, the exact question with its guarantee, what the slate
// leaves alone, then one button that archives the batch, and Cancel. Every word and the counting are the web's own
// (features/archive/confirm-words.ts). Presentational: the batch itself is written by slate.tsx.
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import type { SlateScope } from "@/core/rollover";
import { SLATE_FAILED, SLATE_KEEPS, SLATE_SCOPES, slateConfirmLabel, slateCount, slateQuestion } from "@/features/archive/confirm-words";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Screen } from "~/ui/screen";
import { TARGET, font, useColours } from "~/ui/theme";

export const SLATE_TITLE = "Clear the slate";

export interface SlateViewProps {
  /** How many tasks each scope would take; undefined while counting. */
  counts: { today: number; backlog: number } | undefined;
  /** Archives the scope as one batch; rejects when nothing could be written. */
  onConfirm: (scope: SlateScope) => Promise<unknown>;
  /** Cancel, and what follows a batch archived: back to where the slate was opened from. */
  onClose: () => void;
}

export function SlateView({ counts, onConfirm, onClose }: SlateViewProps) {
  const c = useColours();
  const [scope, setScope] = useState<SlateScope>("today");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = slateCount(counts, scope);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(scope);
      onClose();
    } catch {
      setError(SLATE_FAILED);
      setBusy(false);
    }
  };
  return (
    <Screen title={SLATE_TITLE} back>
      <Card>
        <View accessibilityRole="radiogroup" accessibilityLabel="What to archive">
          {SLATE_SCOPES.map((o, i) => {
            const on = scope === o.value;
            const count = slateCount(counts, o.value);
            return (
              <CardRow key={o.value} first={i === 0}>
                <Pressable accessibilityRole="radio" accessibilityLabel={`${o.label}, ${count ?? "counting"}`} accessibilityHint={o.hint} accessibilityState={{ checked: on }} onPress={() => setScope(o.value)} style={({ pressed }) => [styles.scope, pressed && { backgroundColor: c.surface2 }]}>
                  <View style={[styles.radio, { borderColor: on ? c.ink : c.lineControl }]}>{on ? <View style={[styles.radioDot, { backgroundColor: c.ink }]} /> : null}</View>
                  <View style={styles.scopeWords}>
                    <Text style={[styles.scopeLabel, { color: c.ink }]}>{o.label}</Text>
                    <Text style={[styles.hint, { color: c.ink2 }]}>{o.hint}</Text>
                  </View>
                  <Text style={[styles.count, { color: c.ink2 }]}>{count ?? "…"}</Text>
                </Pressable>
              </CardRow>
            );
          })}
        </View>
      </Card>
      <View style={styles.words}>
        <Text accessibilityLiveRegion="polite" style={[styles.question, { color: c.ink }]}>
          {n === null ? "Counting…" : slateQuestion(n)}
        </Text>
        <Text style={[styles.hint, { color: c.ink3 }]}>{SLATE_KEEPS}</Text>
        {error ? (
          <Text accessibilityRole="alert" style={[styles.hint, { color: c.deadline }]}>
            {error}
          </Text>
        ) : null}
      </View>
      <View style={styles.buttons}>
        <Button variant="primary" label={slateConfirmLabel(n, busy)} disabled={busy || !n} onPress={() => void confirm()} />
        <Button label="Cancel" onPress={onClose} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scope: { minHeight: TARGET + 12, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  scopeWords: { flex: 1 },
  scopeLabel: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  hint: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  count: { fontFamily: font.regular, fontSize: 16, fontVariant: ["tabular-nums"] },
  words: { paddingHorizontal: 20, paddingTop: 20, gap: 8 },
  question: { fontFamily: font.medium, fontSize: 17, lineHeight: 24 },
  buttons: { paddingHorizontal: 20, paddingTop: 20, gap: 10 },
});
