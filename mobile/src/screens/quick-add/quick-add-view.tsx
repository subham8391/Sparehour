// Quick add as the phone draws it (SCREENS.md §11, §22 "← Quick add"): a bottom sheet over the keyboard with one
// line, its tokens painted in place as they are recognised (token-line.tsx); under it the strip that restates what was understood as chips (each with a × that turns its words back into
// title words, or takes off the day, project or area the sheet was opened on) and where the task will go; what tasks
// like this usually take, what the task would do to its day, and any note on the parse; the projects a typed #name
// fits (or the way to make a new one) and the tags a typed @name fits; the row of tokens to tap; Add. The keyboard's
// Done saves and keeps the sheet open for the next line, and the last save is said under the button. A list pasted
// into the line is one task per line, said once ("4 tasks added") with one Undo for all of them. Presentational:
// the line's reading is use-composer.ts (the web's own functions), and saving is handed in.
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { TaskDraft } from "@/core/quickadd";
import { formatMinutes } from "@/core/time";
import type { QuickAddProject, QuickAddTag } from "@/features/quickadd/interpret";
import { NEEDS_NAME, PLACEHOLDER_NARROW, STRIP_HINT, SUGGESTIONS } from "@/features/quickadd/quick-add-words";
import { Button } from "~/ui/button";
import { ChipButton, ChipRow, RemovableChip } from "~/ui/chip-button";
import { FieldNote } from "~/ui/field-row";
import { Icon, type IconName } from "~/ui/icon";
import { IconButton } from "~/ui/screen";
import { Sheet } from "~/ui/sheet";
import { font, useColours } from "~/ui/theme";
import { TokenLine } from "./token-line";
import { useComposer, type QuickAddContext, type QuickAddHere, type QuickAddSave, type StripChip } from "./use-composer";

export interface QuickAddViewProps {
  open: boolean;
  /** Words the sheet opens with (search's "Add “foo” as a task", a discard taken back). */
  initial?: string;
  /** The projects a `#name` files into, each with its area, which tells two of one name apart. */
  projects: readonly QuickAddProject[];
  /** Every tag in the space, for the `@` suggestions; a typed name none matches is made on save. */
  tags?: readonly QuickAddTag[];
  ctx: QuickAddContext;
  /** Where a line that does not say goes: the day, project or area the sheet was opened on. */
  here?: QuickAddHere | null;
  onClose: () => void;
  onSubmit: QuickAddSave;
  /** A paste saved these tasks: returns how to take them all back, once (the caller also puts that on the undo stack). */
  onPasted?: (ids: readonly string[]) => (() => Promise<void>) | null | undefined;
  /** The sheet closed with words in the box: `text` as typed, `title` as the strip would save it. */
  onDiscard?: (text: string, title: string) => void;
  /** What the task would do to its day ("Leaves 2h 50m spare today"), drawn as the strip's last line. */
  dayLine?: (draft: TaskDraft) => ReactNode;
  /** What a task like this usually takes, when that is not what the line counts it as. */
  usual?: (task: { estimateMin: number | null; projectId: string | null }) => number | null;
}

/** The glyph each kind of fact carries, as the web's strip draws them. */
const FACT_ICON: Partial<Record<StripChip["kind"], IconName>> = { time: "clock", day: "calendar", evening: "moon", deadline: "flag", start: "arrow-right", repeat: "routines" };

export function QuickAddView({ open, dayLine, ...input }: QuickAddViewProps) {
  const c = useColours();
  const q = useComposer(input);
  return (
    <Sheet open={open} onClose={q.dismiss}>
      {/* The sheet's way back: the keyboard hides the scrim. */}
      <View style={styles.head}>
        <IconButton icon="arrow-left" label="Close" onPress={q.dismiss} />
        <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
          Quick add
        </Text>
      </View>
      <TokenLine
        accessibilityLabel="Task"
        autoFocus
        value={q.value}
        painted={q.painted}
        holds={q.holds}
        onChangeText={q.onChangeText}
        onKeyPress={(e) => q.onKeyPress(e.nativeEvent.key)}
        selection={q.selection}
        onSelectionChange={(e) => q.onSelectionChange(e.nativeEvent.selection.start)}
        placeholder={PLACEHOLDER_NARROW}
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        returnKeyType="done"
        // Done saves and the box keeps the keyboard, for the next line.
        submitBehavior="submit"
        onSubmitEditing={() => void q.submit()}
      />

      {/* The parse restated; the destination follows the arrow. Read out as it settles. */}
      <View accessibilityLiveRegion="polite" style={styles.strip}>
        {q.chips.length > 0 ? (
          q.chips.map((chip, i) => (
            <RemovableChip
              key={`${chip.kind}-${i}`}
              quiet
              tone={chip.kind === "project" && !chip.tentative ? "meet" : undefined}
              label={chip.text}
              icon={FACT_ICON[chip.kind]}
              onRemove={chip.onRemove}
              removeLabel={`Remove “${chip.text}”`}
              removeHint={chip.here ? "Don't file it here" : "Keep these words in the title"}
            />
          ))
        ) : q.needsName ? (
          <Text style={[styles.words, { color: c.ink2 }]}>{NEEDS_NAME}</Text>
        ) : (
          <Text style={[styles.words, { color: c.ink3 }]}>{STRIP_HINT}</Text>
        )}
        {q.destination ? (
          <View accessible accessibilityLabel={`Goes to ${q.destination}`} style={styles.destination}>
            <Icon name="arrow-right" size={14} color={c.ink3} />
            <Text style={[styles.words, { color: c.ink2 }]}>{q.destination}</Text>
          </View>
        ) : null}
      </View>
      {q.usualMin != null ? <FieldNote text={`Tasks like this usually take you ${formatMinutes(q.usualMin)}.`} action={`Use ${formatMinutes(q.usualMin)}`} onPress={q.takeUsual} /> : null}
      {q.saved && dayLine ? dayLine(q.saved) : null}
      {q.warnings.length > 0 ? <Line icon="alert" text={q.warnings.join(" · ")} /> : null}

      {q.tag ? (
        // The tag being typed: its matches first, then "Create @name".
        <ChipRow label="Tags">
          {q.tag.suggestions.map((t) => (
            <ChipButton key={t.id} label={`@${t.name}`} onPress={() => q.tag?.pick(t)} />
          ))}
          <ChipButton icon="plus" label={`Create @${q.tag.name}`} onPress={q.tag.accept} />
        </ChipRow>
      ) : q.project ? (
        // Two projects of one name are told apart by their area, and neither is made again.
        <ChipRow label="Projects">
          {q.project.suggestions.map(({ project, label }) => (
            <ChipButton key={project.id} label={label} onPress={() => q.project?.pick(project)} />
          ))}
          {!q.project.collision ? <ChipButton icon="plus" chosen={q.project.willCreate} label={`${q.project.willCreate ? "Will create" : "Create"} “${q.project.name}”`} onPress={q.project.create} /> : null}
        </ChipRow>
      ) : null}

      <ChipRow label="Suggestions">
        {SUGGESTIONS.map((s) => (
          <ChipButton key={s.label} label={s.label} onPress={() => q.insert(s.insert)} />
        ))}
      </ChipRow>

      <Button variant="primary" block label="Add" disabled={!q.canAdd} onPress={() => void q.submit()} />
      {q.notice ? (
        <View accessibilityLiveRegion="polite" style={styles.notice}>
          <View style={styles.grow}>
            <Line icon="check" text={q.notice.text} />
          </View>
          {/* A paste's one way back: every task it added, taken back together. */}
          {q.notice.undo ? <Button variant="quiet" label="Undo" onPress={q.notice.undo} /> : null}
        </View>
      ) : null}
      {q.error ? (
        <View accessibilityRole="alert" style={styles.line}>
          <View style={styles.glyph}>
            <Icon name="alert" size={14} color={c.deadline} />
          </View>
          <Text style={[styles.words, styles.grow, { color: c.deadline }]}>{q.error}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

/** One quiet line of the sheet with its glyph: the day line, a note on the parse, the last save. */
export function Line({ icon, text }: { icon: IconName; text: string }) {
  const c = useColours();
  return (
    <View style={styles.line}>
      <View style={styles.glyph}>
        <Icon name={icon} size={14} color={c.ink3} />
      </View>
      <Text style={[styles.words, styles.grow, { color: c.ink2 }]}>{text}</Text>
    </View>
  );
}

/** What the task would do to its day, in ink with its glyph; over is said in ink too, never red. */
export function DayEffectLine({ text, over }: { text: string; over: boolean }) {
  return <Line icon={over ? "alert" : "clock"} text={text} />;
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: -10, marginTop: -4 },
  title: { fontFamily: font.semibold, fontSize: 18 },
  strip: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, minHeight: 22 },
  destination: { flexDirection: "row", alignItems: "center", gap: 4 },
  words: { flexShrink: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  grow: { flex: 1 },
  line: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  notice: { flexDirection: "row", alignItems: "center", gap: 8 },
  // The glyph sits on the first line of its words.
  glyph: { height: 20, justifyContent: "center" },
});
