// The pieces every Settings section on the phone is built from (SCREENS.md §18; the web's are
// features/settings/settings-ui.tsx): a section's frame, a card with its inline "Saved", a row with its name, the
// quiet line under it and its value or control, and the sheets a row opens: a list of choices, a time, a number,
// and the typed confirmation every final delete shares. Presentational.
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CONFIRM_FAILED, CONFIRM_WORD, confirms } from "@/features/archive/confirm-words";
import type { NumberBounds } from "@/features/settings/section-words";
import { readNumber } from "@/features/settings/settings-rules";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { Icon } from "~/ui/icon";
import { MenuRow } from "~/ui/menu-row";
import { Screen } from "~/ui/screen";
import { SectionLabel } from "~/ui/section-label";
import { Sheet } from "~/ui/sheet";
import { Stepper } from "~/ui/stepper";
import { TextField } from "~/ui/text-field";
import { font, useColours } from "~/ui/theme";
import { TimePicker } from "~/ui/time-picker";

/** A section pushed over the list: Back in the header returns to it. */
export function SectionFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Screen title={title} eyebrow="Settings" back>
      {children}
    </Screen>
  );
}

/** The "Saved" that follows a change: always in the tree, so it is read out when it appears. */
export function Saved({ on }: { on: boolean }) {
  const c = useColours();
  return (
    <View accessibilityLiveRegion="polite" style={styles.saved}>
      {on ? (
        <>
          <Icon name="check" size={12} color={c.ink3} strokeWidth={2} />
          <Text style={[styles.savedText, { color: c.ink3 }]}>Saved</Text>
        </>
      ) : null}
    </View>
  );
}

/**
 * One card of a section. The section's first card has no name of its own (the screen's title says it) and keeps
 * only the "Saved"; a card further down is named. `note` is the caption under the card.
 */
export function Group({ title, saved, note, children }: { title?: string; /** Left out for a card that does not save from here. */ saved?: boolean; note?: string; children: ReactNode }) {
  const c = useColours();
  return (
    <View>
      {title ? (
        <SectionLabel label={title} action={saved === undefined ? undefined : <Saved on={saved} />} />
      ) : saved === undefined ? null : (
        <View style={styles.savedBar}>
          <Saved on={saved} />
        </View>
      )}
      <Card>{children}</Card>
      {note ? <Text style={[styles.note, { color: c.ink3 }]}>{note}</Text> : null}
    </View>
  );
}

/** A line of words between or under cards: a notice, a caption, or (`tone="error"`) something that failed. */
export function Line({ text, tone = "quiet", status = false, flush = false }: { text: string; tone?: "quiet" | "ink" | "error"; /** Read out when it appears. */ status?: boolean; /** Inside a sheet or a card, which have their own edges. */ flush?: boolean }) {
  const c = useColours();
  return (
    <Text accessibilityRole={tone === "error" ? "alert" : undefined} accessibilityLiveRegion={status || tone === "error" ? "polite" : undefined} style={[styles.line, flush && styles.flush, { color: tone === "error" ? c.deadline : tone === "ink" ? c.ink : c.ink2 }]}>
      {text}
    </Text>
  );
}

/** A row that only says something, quietly ("Loading…", "Nothing archived."), or (`tone="error"`) what failed. */
export function QuietRow({ text, tone = "quiet", status = false, children }: { text: string; tone?: "quiet" | "error"; status?: boolean; /** What to do about it, under the words. */ children?: ReactNode }) {
  return (
    <View style={styles.quietRow}>
      <Line text={text} tone={tone} status={status} flush />
      {children}
    </View>
  );
}

export interface SettingRowProps {
  label: string;
  /** The second line under the name. */
  hint?: string;
  /** The value at the far edge, as words. */
  value?: string;
  /** What a screen reader hears for the value, when the drawn one is short for it. */
  says?: string;
  /** The value stands for nothing chosen ("Off", "—"). */
  quiet?: boolean;
  /** The row opens something (a sheet): the whole row is the target. */
  onPress?: () => void;
  disabled?: boolean;
  /** A control at the far edge in place of a value (a stepper, a button). */
  right?: ReactNode;
  /** A control too wide for the far edge, under the words (a segmented control). */
  children?: ReactNode;
  accessibilityLabel?: string;
}

/** One setting: 52 points at least, the name at the near edge and its value or control at the far one. */
export function SettingRow({ label, hint, value, says, quiet = false, onPress, disabled = false, right, children, accessibilityLabel }: SettingRowProps) {
  const c = useColours();
  const top = (
    <View style={styles.rowTop}>
      <View style={styles.words}>
        <Text style={[styles.label, { color: disabled ? c.ink3 : c.ink }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: c.ink2 }]}>{hint}</Text> : null}
      </View>
      {value !== undefined ? <Text style={[styles.value, { color: quiet || disabled ? c.ink3 : c.ink2 }]}>{value}</Text> : null}
      {right}
      {onPress && !right ? <Icon name="chevron-right" size={16} color={c.ink3} /> : null}
    </View>
  );
  if (onPress)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityValue={value !== undefined ? { text: says ?? value } : undefined} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.surface2 }]}>
        {top}
        {children}
      </Pressable>
    );
  return (
    <View style={styles.row}>
      {top}
      {children}
    </View>
  );
}

const cancel = (onClose: () => void) => <Button variant="quiet" label="Cancel" onPress={onClose} />;

/** A row's choices as a sheet: one line each, the one already made ticked. Choosing writes it and closes. */
export function ChoiceSheet<T extends string | number>({ open, title, options, value, onChange, onClose }: { open: boolean; title: string; options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; onClose: () => void }) {
  return (
    <Sheet open={open} title={title} onClose={onClose} footer={cancel(onClose)}>
      <View>
        {options.map((o) => (
          <MenuRow
            key={String(o.value)}
            label={o.label}
            current={o.value === value}
            onPress={() => {
              if (o.value !== value) onChange(o.value);
              onClose();
            }}
          />
        ))}
      </View>
    </Sheet>
  );
}

/** A time of day as a sheet: the app's one time picker; Set writes it and closes. */
export function TimeSheet({ open, title, value, start, onSet, onClose }: { open: boolean; title: string; /** "HH:MM", or "" for none yet. */ value: string; /** Where it starts with no time yet. */ start?: string; onSet: (value: string) => void; onClose: () => void }) {
  return (
    <Sheet open={open} title={title} onClose={onClose} footer={cancel(onClose)}>
      {open ? (
        <TimePicker
          value={value}
          start={start}
          onSet={(v) => {
            if (v) onSet(v);
            onClose();
          }}
        />
      ) : null}
    </Sheet>
  );
}

/** A number as a sheet: typed, or stepped; Set is asleep until it is inside the row's bounds (the web's own rule). */
export function NumberSheet({ open, title, value, bounds, onSet, onClose }: { open: boolean; title: string; value: number; bounds: NumberBounds; onSet: (value: number) => void; onClose: () => void }) {
  return (
    <Sheet open={open} title={title} onClose={onClose} footer={cancel(onClose)}>
      {open ? <NumberBody title={title} value={value} bounds={bounds} onSet={onSet} onClose={onClose} /> : null}
    </Sheet>
  );
}

function NumberBody({ title, value, bounds, onSet, onClose }: { title: string; value: number; bounds: NumberBounds; onSet: (value: number) => void; onClose: () => void }) {
  const c = useColours();
  const [draft, setDraft] = useState(String(value));
  const read = readNumber(draft.trim(), bounds.min, bounds.max);
  const at = read ?? value;
  const step = (direction: -1 | 1) => setDraft(String(Math.max(bounds.min, Math.min(bounds.max, at + direction * bounds.step))));
  const set = () => {
    if (read === null) return;
    if (read !== value) onSet(read);
    onClose();
  };
  return (
    <View style={styles.gap}>
      <View style={styles.numberRow}>
        <TextField accessibilityLabel={title} value={draft} onChangeText={setDraft} keyboardType="number-pad" returnKeyType="done" onSubmitEditing={set} selectTextOnFocus style={styles.numberField} />
        <Text style={[styles.unit, { color: c.ink2 }]}>{bounds.unit}</Text>
        <Stepper label={title} value={String(at)} says={`${at} ${bounds.unit}`} onStep={step} canDown={at > bounds.min} canUp={at < bounds.max} />
      </View>
      <Text style={[styles.hint, { color: read === null ? c.ink : c.ink2 }]}>{`From ${bounds.min} to ${bounds.max} ${bounds.unit}.`}</Text>
      <Button variant="primary" label={read === null ? "Set" : `Set ${read} ${bounds.unit}`} disabled={read === null} onPress={set} />
    </View>
  );
}

export interface TypedConfirmProps {
  open: boolean;
  title: string;
  /** What goes, said exactly, and anything to do first. */
  children: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  /** Resolves an error to show, or null once done (the caller closes the sheet). */
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}

/**
 * The typed confirmation every final delete shares (the web's features/archive/typed-confirm.tsx): the person types
 * the word, then the one destructive button wakes up. There is no undo behind it, so nothing here offers one.
 */
export function TypedConfirmSheet(p: TypedConfirmProps) {
  const [busy, setBusy] = useState(false);
  return (
    // While the delete is on its way the sheet stays, to say how it went.
    <Sheet open={p.open} title={p.title} onClose={busy ? () => undefined : p.onClose}>
      {p.open ? <TypedConfirmBody {...p} onBusy={setBusy} /> : null}
    </Sheet>
  );
}

function TypedConfirmBody({ children, confirmLabel, busyLabel, onConfirm, onClose, onBusy }: TypedConfirmProps & { onBusy: (busy: boolean) => void }) {
  const c = useColours();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirms(typed) && !busy;
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    onBusy(true);
    setError(null);
    const failed = await onConfirm().catch(() => CONFIRM_FAILED);
    onBusy(false);
    if (failed) {
      setError(failed);
      setBusy(false);
    }
  };
  return (
    <View style={styles.gap}>
      {children}
      <Text style={[styles.confirmLabel, { color: c.ink }]}>{`Type ${CONFIRM_WORD} to confirm`}</Text>
      <TextField accessibilityLabel={`Type ${CONFIRM_WORD} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} autoComplete="off" spellCheck={false} returnKeyType="done" onSubmitEditing={() => void submit()} />
      {error ? <Line text={error} tone="error" flush /> : null}
      <Button variant="primary" destructive label={busy ? busyLabel : confirmLabel} disabled={!ready} onPress={() => void submit()} />
      <Button label="Cancel" disabled={busy} onPress={onClose} />
    </View>
  );
}

/** A paragraph inside a sheet. */
export function Words({ text, strong = false }: { text: string; strong?: boolean }) {
  const c = useColours();
  return <Text style={[styles.words16, { color: strong ? c.ink : c.ink2 }]}>{text}</Text>;
}

const styles = StyleSheet.create({
  saved: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 20 },
  savedText: { fontFamily: font.medium, fontSize: 13 },
  savedBar: { minHeight: 20, marginHorizontal: 22, marginBottom: 8, alignItems: "flex-end", justifyContent: "center" },
  note: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginHorizontal: 22, marginTop: 8 },
  line: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginHorizontal: 22, marginTop: 10 },
  flush: { marginHorizontal: 0, marginTop: 0 },
  row: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 8, justifyContent: "center", gap: 8 },
  quietRow: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 12, justifyContent: "center", alignItems: "flex-start", gap: 10 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  // Room for the longest single word a label has ("Wednesday"), so a long value wraps instead of breaking the word.
  words: { flex: 1, minWidth: 100 },
  label: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  hint: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginTop: 1 },
  value: { flexShrink: 1, maxWidth: "55%", fontFamily: font.regular, fontSize: 16, textAlign: "right", fontVariant: ["tabular-nums"] },
  gap: { gap: 10 },
  numberRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  numberField: { flex: 1, minWidth: 72, fontVariant: ["tabular-nums"] },
  unit: { fontFamily: font.regular, fontSize: 15 },
  confirmLabel: { fontFamily: font.medium, fontSize: 15 },
  words16: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
});
