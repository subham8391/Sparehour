// Step 3, "What's on your plate today?", as the phone draws it (ONBOARDING.md §Step 3; SCREENS.md §23; the web's is
// features/welcome/brain-dump.tsx): quick add's own line in the page, without the suggestion chips, so what is learnt
// here is how the app works. Each Done saves a real task, which joins the rows above the box; a line that names no
// day of its own goes on today, and the strip says so before it is saved. A pasted list is one task a line with one
// Undo, in the composer's own notice (no toast over the buttons). After the twentieth a quiet line says so and the
// rest go to the Inbox. Either button first saves a line still in the box, so tapping Next after typing loses nothing.
// The line, its painted tokens, its reading and a pasted list are quick add's own composer (quick-add/use-composer.ts,
// token-line.tsx: the web's own functions); how a line lands and every word are the web's (features/welcome/
// welcome-rules.ts, welcome-words.ts). Presentational: saving and taking back are handed in.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, View, type ScrollViewInstance } from "react-native";
import { Text } from "~/ui/text";
import type { TaskDraft } from "@/core/quickadd";
import { formatMinutes } from "@/core/time";
import type { QuickAddSubmission } from "@/features/quickadd/file-line";
import { interpret, type Fact, type QuickAddProject, type QuickAddTag } from "@/features/quickadd/interpret";
import { NEEDS_NAME } from "@/features/quickadd/quick-add-words";
import { BRAIN_DUMP_TODAY_LIMIT, PLENTY_LINE, keptForThen, nextLabel } from "@/features/welcome/welcome-rules";
import { BRAIN_DUMP_WORDS, HINT } from "@/features/welcome/welcome-words";
import { Line } from "~/screens/quick-add/quick-add-view";
import { TokenLine } from "~/screens/quick-add/token-line";
import { useComposer, type QuickAddContext, type StripChip } from "~/screens/quick-add/use-composer";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip, type ChipTone } from "~/ui/chip";
import { ChipButton, ChipRow, RemovableChip } from "~/ui/chip-button";
import { FieldNote } from "~/ui/field-row";
import { Icon, type IconName } from "~/ui/icon";
import { TARGET, font, useColours } from "~/ui/theme";
import { brainDumpStrip } from "./brain-dump-strip";
import { StepLine, WelcomeFrame } from "./welcome-frame";

/** A line saved here: the task it made and how it was saved. */
export interface Added {
  id: string;
  draft: TaskDraft;
}

export interface BrainDumpViewProps {
  ctx: QuickAddContext;
  /** The projects a `#name` files into, each with its area. */
  projects: readonly QuickAddProject[];
  /** Every tag in the space, for the `@` suggestions. */
  tags?: readonly QuickAddTag[];
  /** The lines saved so far, in order: the rows above the box. */
  added: readonly Added[];
  /** One of the three examples, changed by whoever holds this step. */
  placeholder: string;
  /** Saves one line as the brain dump files it; resolves the new task's id. */
  onSubmit: (submission: QuickAddSubmission) => Promise<string>;
  /** A paste saved these tasks: returns how to take them all back, once (the composer's notice carries the Undo). */
  onPasted: (ids: readonly string[]) => () => Promise<void>;
  /** "Next — N things" or "I'll add things later": either way the first run is over. */
  onFinish: () => void;
  busy?: boolean;
  /** Why ending the first run failed; the step stays as it is. */
  failure?: string | null;
  /** What the line would do to today, drawn as the strip's last line. */
  dayLine?: (draft: TaskDraft) => ReactNode;
  usual?: (task: { estimateMin: number | null; projectId: string | null }) => number | null;
}

/** The glyph each kind of fact carries, as quick add's strip draws them. */
const FACT_ICON: Partial<Record<StripChip["kind"], IconName>> = { time: "clock", day: "calendar", evening: "moon", deadline: "flag", start: "arrow-right", repeat: "routines" };
const TONE: Partial<Record<Fact["kind"], ChipTone>> = { time: "time", evening: "time", day: "time" };

export function BrainDumpView({ ctx, projects, tags, added, placeholder, onSubmit, onPasted, onFinish, busy = false, failure = null, dayLine, usual }: BrainDumpViewProps) {
  const c = useColours();
  const q = useComposer({ projects, tags, ctx, usual, onSubmit: (s) => onSubmit(s), onPasted, onClose: () => undefined });
  const count = added.length;
  const strip = brainDumpStrip(q.chips, q.destination, q.saved, ctx.today, count);
  const scroll = useRef<ScrollViewInstance>(null);
  // Each row pushes the box down: keep it (and the strip under it) in view above the buttons held at the bottom.
  useEffect(() => {
    if (count > 0) scroll.current?.scrollToEnd({ animated: true });
  }, [count]);

  /** The saves asked for so far: the last one's answer, and how many have not settled. */
  const last = useRef<Promise<boolean>>(Promise.resolve(true));
  const inFlight = useRef(0);
  const [finishing, setFinishing] = useState(false);

  /** Saves the line in the box as Done does; true once it is saved. */
  const send = (): Promise<boolean> => {
    inFlight.current += 1;
    const done = q.submit().finally(() => {
      inFlight.current -= 1;
    });
    last.current = done;
    return done;
  };

  // A line still in the box is saved first; if it cannot be (no name yet, or the save failed), the step stays and
  // the composer says why. An empty box waits for the saves still under way.
  const finish = async () => {
    setFinishing(true);
    try {
      const saved = q.value.trim() !== "" ? await send() : inFlight.current === 0 ? true : await last.current;
      if (saved) onFinish();
    } finally {
      setFinishing(false);
    }
  };

  const waiting = busy || finishing;
  return (
    <WelcomeFrame
      title={BRAIN_DUMP_WORDS.title}
      lead={BRAIN_DUMP_WORDS.lead}
      scrollRef={scroll}
      footer={
        <>
          <Button block label={BRAIN_DUMP_WORDS.later} disabled={waiting} onPress={() => void finish()} />
          <Button variant="primary" block label={nextLabel(count)} disabled={waiting} onPress={() => void finish()} />
        </>
      }
    >
      {count > 0 ? (
        <Card style={styles.card}>
          <View accessibilityLabel={BRAIN_DUMP_WORDS.list}>
            {added.map((a, i) => (
              <CardRow key={a.id} first={i === 0}>
                <AddedRow draft={a.draft} ctx={ctx} />
              </CardRow>
            ))}
          </View>
        </Card>
      ) : null}
      {count >= BRAIN_DUMP_TODAY_LIMIT ? <StepLine text={PLENTY_LINE} /> : null}

      <View style={styles.composer}>
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
          placeholder={placeholder}
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="done"
          // Done saves and the box keeps the keyboard, for the next line.
          submitBehavior="submit"
          onSubmitEditing={() => void send()}
        />

        {/* The parse restated; the destination follows the arrow. Read out as it settles. */}
        <View accessibilityLiveRegion="polite" style={styles.strip}>
          {strip.chips.length > 0 ? (
            strip.chips.map((chip, i) => <RemovableChip key={`${chip.kind}-${i}`} quiet label={chip.text} icon={FACT_ICON[chip.kind]} onRemove={chip.onRemove} removeLabel={`Remove “${chip.text}”`} removeHint="Keep these words in the title" />)
          ) : q.needsName ? (
            <Text style={[styles.words, { color: c.ink2 }]}>{NEEDS_NAME}</Text>
          ) : (
            <Text style={[styles.words, { color: c.ink3 }]}>
              {HINT.before}
              {HINT.tokens.map((token, i) => (
                <Text key={token}>
                  {i > 0 ? ", " : ""}
                  <Text style={[styles.token, { color: c.ink2, backgroundColor: c.surface2 }]}>{token}</Text>
                </Text>
              ))}
              {HINT.after}
            </Text>
          )}
          {strip.destination ? (
            <View accessible accessibilityLabel={`Goes to ${strip.destination}`} style={styles.destination}>
              <Icon name="arrow-right" size={14} color={c.ink3} />
              <Text style={[styles.words, { color: c.ink2 }]}>{strip.destination}</Text>
            </View>
          ) : null}
        </View>
        {q.usualMin != null ? <FieldNote text={`Tasks like this usually take you ${formatMinutes(q.usualMin)}.`} action={`Use ${formatMinutes(q.usualMin)}`} onPress={q.takeUsual} /> : null}
        {strip.saved && dayLine ? dayLine(strip.saved) : null}
        {q.warnings.length > 0 ? <Line icon="alert" text={q.warnings.join(" · ")} /> : null}

        {q.tag ? (
          <ChipRow label="Tags">
            {q.tag.suggestions.map((t) => (
              <ChipButton key={t.id} label={`@${t.name}`} onPress={() => q.tag?.pick(t)} />
            ))}
            <ChipButton icon="plus" label={`Create @${q.tag.name}`} onPress={q.tag.accept} />
          </ChipRow>
        ) : q.project ? (
          <ChipRow label="Projects">
            {q.project.suggestions.map(({ project, label }) => (
              <ChipButton key={project.id} label={label} onPress={() => q.project?.pick(project)} />
            ))}
            {!q.project.collision ? <ChipButton icon="plus" chosen={q.project.willCreate} label={`${q.project.willCreate ? "Will create" : "Create"} “${q.project.name}”`} onPress={q.project.create} /> : null}
          </ChipRow>
        ) : null}

        {/* The step's own button is the primary; Add stays as the tap path for a keyboard without Done. */}
        <Button label="Add" disabled={!q.canAdd} onPress={() => void send()} style={styles.add} />
        {q.notice ? (
          <View accessibilityLiveRegion="polite" style={styles.notice}>
            <View style={styles.noticeWords}>
              <Line icon="check" text={q.notice.text} />
            </View>
            {/* A paste's one way back: every task it added, taken back together. */}
            {q.notice.undo ? <Button variant="quiet" label="Undo" onPress={q.notice.undo} /> : null}
          </View>
        ) : null}
        {q.error ? <StepLine text={q.error} tone="error" /> : null}
      </View>
      {failure ? <StepLine text={failure} tone="error" /> : null}
    </WelcomeFrame>
  );
}

/** A saved line: its title and what was read from it, and where a day of its own sent it. */
function AddedRow({ draft, ctx }: { draft: TaskDraft; ctx: QuickAddContext }) {
  const c = useColours();
  // Today is where every row goes unless it says otherwise, so a "Today" chip on each would only be noise.
  const facts = interpret(draft, ctx.today).facts.filter((f) => !(f.kind === "day" && f.label === "Today"));
  const kept = keptForThen(draft, ctx.today);
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <View aria-hidden style={[styles.ring, { borderColor: c.lineControl }]} />
        <Text numberOfLines={1} style={[styles.rowTitle, { color: c.ink }]}>
          {draft.title}
        </Text>
      </View>
      {facts.length > 0 ? (
        <View style={styles.rowFacts}>
          {facts.map((f, i) => (
            <Chip key={i} tone={TONE[f.kind] ?? "neutral"} label={f.chip ?? f.label} />
          ))}
        </View>
      ) : null}
      {kept ? <Text style={[styles.kept, { color: c.ink2 }]}>{kept}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The frame already keeps 20 points at each side.
  card: { marginHorizontal: 0 },
  composer: { gap: 10 },
  strip: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, minHeight: 22 },
  destination: { flexDirection: "row", alignItems: "center", gap: 4 },
  words: { flexShrink: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  token: { fontFamily: font.medium },
  add: { alignSelf: "flex-end" },
  notice: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: TARGET },
  noticeWords: { flex: 1 },
  row: { minHeight: TARGET, justifyContent: "center", gap: 4, paddingHorizontal: 14, paddingVertical: 10 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  ring: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.6 },
  rowTitle: { flex: 1, fontFamily: font.medium, fontSize: 17 },
  rowFacts: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingLeft: 28 },
  kept: { paddingLeft: 28, fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
});
