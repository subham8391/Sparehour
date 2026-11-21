// A task's detail as the phone draws it (SCREENS.md §10 at phone width; the web's is features/tasks/
// task-detail-panel.tsx): the ring and the title, the fields in the panel's order, each opening its picker in a bottom
// sheet, then the checklist, the tags and the notes, and a footer with Complete first and the quiet actions in a
// menu. Every field saves on change; there is no Save button. Presentational: it is handed everything it shows, so it
// is drawn with made-up data in the browser preview and in tests, and with the real task by task-detail.tsx. What a
// field offers, what it says and when it asks are the web's own rules (features/tasks/detail-rules.ts and beside it).
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { compareDates, formatMinutes, formatTime, type Instant, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { ChecklistItem, RecurrenceException, RecurrenceMode, TagRef, Task } from "@/core/types";
import type { TaskPatch } from "@/data/repositories/task-repo";
import type { DayPart } from "@/features/looks/look";
import { dayLabel } from "@/features/quickadd/day-label";
import { MISS_POLICIES, PRIORITIES, asksSeriesDay, carriedWords, detailActions, dueBeforeDo, repeatValue, type SeriesDayChange } from "@/features/tasks/detail-rules";
import { guessLabel } from "@/features/tasks/estimate-presets";
import { pausedUntil, repeatSummary } from "@/features/tasks/series-words";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { Chip } from "~/ui/chip";
import { Empty } from "~/ui/empty";
import { FieldNote, FieldRow } from "~/ui/field-row";
import { Icon } from "~/ui/icon";
import { IconButton, Screen } from "~/ui/screen";
import { SectionLabel } from "~/ui/section-label";
import { font, useColours } from "~/ui/theme";
import { EstimateSheet, HeadingSheet, MissedSheet, MoreSheet, PrioritySheet, ProjectSheet, type MoreAction } from "./choice-sheets";
import { DateSheet, DoSheet } from "./day-sheets";
import { RepeatSheet } from "./repeat-sheet";
import { StepList } from "./step-list";
import { TagBox } from "./tag-box";
import { useDraft } from "./use-draft";

export interface TaskDetailViewProps {
  task: Task;
  projectName: string | null;
  areaName: string | null;
  /** `area` tells two projects of one name apart in the picker (PRODUCT_SPEC.md §5.4). */
  projects: readonly { id: string; name: string; area?: string | null }[];
  /** The areas a task can be filed in directly, after the projects in the Project field's picker. */
  areas?: readonly { id: string; name: string }[];
  /** The headings of the task's project, for the Heading field. */
  headings?: readonly { id: string; title: string }[];
  onHeading?: (headingId: string | null) => void;
  checklist?: readonly ChecklistItem[];
  tags?: readonly TagRef[];
  /** Every tag in the space, for suggestions. */
  allTags?: readonly TagRef[];
  now: Instant;
  zone: string;
  today: LocalDate;
  /** The hour's sky. */
  part?: DayPart;
  /** The account's default estimate: what a task without one is counted as ("30m?"). */
  defaultEstimateMin: number;
  onPatch: (patch: TaskPatch) => void;
  onComplete: () => void;
  onReopen: () => void;
  onSomeday: () => void;
  onDrop: () => void;
  /** How long a finished task took, once that is recorded. */
  took?: number | null;
  /** Records it, or clears it with null; with this, a finished task shows a Took field under its Estimate. */
  onTook?: (minutes: number | null) => void;
  /** What a task like this usually takes, when that is not what it is counted as. */
  usual?: number | null;
  onConvert?: () => void;
  onDuplicate?: () => void;
  onChecklistAdd?: (title: string, sortKey?: string) => void;
  onChecklistToggle?: (id: string, done: boolean) => void;
  onChecklistRename?: (id: string, title: string) => void;
  onChecklistRemove?: (id: string) => void;
  onChecklistReorder?: (id: string, sortKey: string) => void;
  onTagAdd?: (name: string) => void;
  onTagRemove?: (tagId: string) => void;
  // ---- a repeating task's series (SCREENS.md §10 "Recurring")
  /** The series' one-off changes (moves and skips), for the header's "next" and the moved-day question. */
  exceptions?: readonly RecurrenceException[];
  /** A new do-date for a repeating task, once the person has said which: this occurrence only, or the rule. */
  onSeriesDay?: (choice: "once" | "rule", change: SeriesDayChange) => void;
  /** A new rule typed in for a task that already repeats: it starts again from today. */
  onChangeRule?: (rule: string, mode: RecurrenceMode) => void;
  onSkipOccurrence?: () => void;
  onPause?: (until: LocalDate) => void;
  onResume?: () => void;
}

type Open = "do" | "deadline" | "start" | "estimate" | "took" | "priority" | "project" | "heading" | "repeat" | "pause" | "missed" | "more" | null;

/** The footer's own height over the phone's bottom inset: what the body leaves free under itself. */
const FOOTER = 66;

export function TaskDetailView(p: TaskDetailViewProps) {
  const { task, today, onPatch } = p;
  const c = useColours();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const can = detailActions(task);
  const done = can.done;
  const tagInput = useRef<TextInputInstance>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    },
    [],
  );

  // A title is one line of words, however it wraps: a pasted line break becomes a space, and an emptied box goes back.
  const title = useDraft(task.title, (text) => {
    const next = text.trim();
    if (next && next !== task.title) onPatch({ title: next });
    return next || task.title;
  });
  const sameNote = (a: string | null, b: string | null) => (a?.trim() || null) === (b?.trim() || null);
  const notes = useDraft(task.notes ?? "", (text) => {
    if (!sameNote(text, task.notes)) onPatch({ notes: text.trim() || null });
    return text;
  });

  const asks = asksSeriesDay(task, Boolean(p.onSeriesDay));
  const paused = pausedUntil(task, today);
  const seriesActions = can.repeating && Boolean(p.onSkipOccurrence || p.onPause || p.onResume);
  const missed = Boolean(task.deadline && compareDates(task.deadline, today) < 0);
  const doWords = task.doDate ? dayLabel(task.doDate, today) : "No day";
  const priority = PRIORITIES.find((x) => x.value === task.priority);
  const heading = p.headings?.find((h) => h.id === task.headingId);
  const repeat = repeatValue(task);
  const carried = carriedWords(task, today);
  const place = [p.areaName, p.projectName].filter(Boolean).join(" › ");

  // Everything the footer does not show as a button, in the web menu's order (SCREENS.md §10 footer ⋯).
  const then = (run: () => void) => () => (close(), run());
  const more: MoreAction[] = [
    ...(seriesActions && p.onSkipOccurrence && !paused ? [{ label: "Skip this occurrence", onPress: then(p.onSkipOccurrence) }] : []),
    ...(seriesActions && paused && p.onResume ? [{ label: "Resume repeats", onPress: then(p.onResume) }] : []),
    ...(seriesActions && !paused && p.onPause ? [{ label: "Pause repeats until…", onPress: () => setOpen("pause") }] : []),
    ...(can.someday ? [{ label: "Someday", onPress: then(p.onSomeday) }] : []),
    ...(can.drop ? [{ label: "Drop", onPress: then(p.onDrop) }] : []),
    ...(can.open ? [{ label: "Move to project…", onPress: () => setOpen("project") }] : []),
    ...(can.open && p.onTagAdd
      ? [
          {
            label: "Add a tag…",
            onPress: () => {
              close();
              // Once the sheet has gone: a field cannot take the cursor from under an open sheet.
              focusTimer.current = setTimeout(() => tagInput.current?.focus(), 300);
            },
          },
        ]
      : []),
    ...(p.onDuplicate ? [{ label: "Duplicate", onPress: then(p.onDuplicate) }] : []),
    ...(p.onConvert && can.convert ? [{ label: "Convert to project", onPress: then(p.onConvert) }] : []),
  ];

  return (
    <View style={styles.fill}>
      <Screen title="Task" eyebrow={place || undefined} back part={p.part} bottomRoom={FOOTER + insets.bottom}>
        <Card>
          <View style={styles.head}>
            <Pressable accessibilityRole="button" accessibilityLabel={done ? "Mark not done" : "Mark done"} accessibilityState={{ selected: done }} onPress={done ? p.onReopen : p.onComplete} style={styles.ringTarget}>
              <View style={[styles.ring, { borderColor: done ? c.ink : c.lineControl, backgroundColor: done ? c.ink : "transparent" }]}>{done && <Icon name="check" size={14} color={c.paper} strokeWidth={2.4} />}</View>
            </Pressable>
            <TextInput
              accessibilityLabel="Title"
              value={title.draft}
              onChangeText={(t) => title.setDraft(t.replace(/\s*[\r\n]+\s*/g, " "))}
              onFocus={title.onFocus}
              onBlur={title.onBlur}
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              style={[styles.title, { color: done ? c.ink3 : c.ink }, done && styles.struck]}
            />
          </View>
          {can.repeating ? (
            <CardRow>
              {paused ? <FieldNote text={`Paused until ${formatDay(paused, { today })}`} action={p.onResume ? "Resume" : undefined} onPress={p.onResume} /> : <FieldNote text={repeatSummary(task, today, p.exceptions) ?? ""} />}
            </CardRow>
          ) : null}
        </Card>

        <View style={styles.gap} />
        <Card>
          <FieldRow
            label="Do"
            value={doWords}
            says={task.doDate ? `${doWords}${task.doTime ? ` ${formatTime(task.doTime)}` : task.evening ? ", evening" : ""}` : doWords}
            quiet={!task.doDate}
            extra={task.doDate && task.doTime ? <Chip tone="time" label={formatTime(task.doTime)} /> : task.doDate && task.evening ? <Chip label="evening" /> : undefined}
            onPress={() => setOpen("do")}
          />
          <CardRow>
            {task.deadline ? (
              // Only a missed deadline is red.
              <FieldRow label="Deadline" value={formatDay(task.deadline, { today })} says={`${missed ? "Missed, " : ""}${formatDay(task.deadline, { today })}`} chip={missed ? "deadline" : "neutral"} onPress={() => setOpen("deadline")} />
            ) : (
              <FieldRow label="Deadline" value="—" says="None" quiet onPress={() => setOpen("deadline")} />
            )}
          </CardRow>
          {dueBeforeDo(task) && task.deadline ? (
            // Both dates stay as set (PRODUCT_SPEC.md §5.4): a note, never a correction. On a repeat the deadline is
            // this occurrence's, so doing it by then moves this occurrence only.
            <CardRow>
              <FieldNote
                text="Due before you plan to do it"
                action="Do it by then"
                onPress={() => {
                  const by = task.deadline;
                  if (!by) return;
                  if (asks) p.onSeriesDay?.("once", { doDate: by });
                  else onPatch({ doDate: by });
                }}
              />
            </CardRow>
          ) : null}
          <CardRow>
            <FieldRow label="Starts" value={task.startDate ? formatDay(task.startDate, { today }) : "—"} says={task.startDate ? undefined : "None"} quiet={!task.startDate} onPress={() => setOpen("start")} />
          </CardRow>
          <CardRow>
            {task.estimateMin ? (
              <FieldRow label="Estimate" value={formatMinutes(task.estimateMin)} chip="neutral" onPress={() => setOpen("estimate")} />
            ) : (
              <FieldRow label="Estimate" value={`${formatMinutes(p.defaultEstimateMin)}?`} says={guessLabel(p.defaultEstimateMin)} chip="guess" onPress={() => setOpen("estimate")} />
            )}
          </CardRow>
          {/* What finished tasks say about this estimate: said, and taken only with a tap (DECISIONS.md, amendment 2026-11-15). */}
          {p.usual != null && can.usual ? (
            <CardRow>
              <FieldNote text={`Tasks like this usually take you ${formatMinutes(p.usual)}.`} action={`Use ${formatMinutes(p.usual)}`} onPress={() => onPatch({ estimateMin: p.usual })} />
            </CardRow>
          ) : null}
          {done && p.onTook ? (
            <CardRow>{p.took ? <FieldRow label="Took" value={formatMinutes(p.took)} chip="neutral" onPress={() => setOpen("took")} /> : <FieldRow label="Took" value="—" says="Not recorded" quiet onPress={() => setOpen("took")} />}</CardRow>
          ) : null}
          <CardRow>{task.priority && priority ? <FieldRow label="Priority" value={priority.label} chip="neutral" onPress={() => setOpen("priority")} /> : <FieldRow label="Priority" value="None" quiet onPress={() => setOpen("priority")} />}</CardRow>
          <CardRow>
            {/* Plain words, not a chip: a project's name can be long, and a row cuts it to one line. */}
            {p.projectName ? (
              <FieldRow label="Project" value={`#${p.projectName}`} onPress={() => setOpen("project")} />
            ) : task.areaId && p.areaName ? (
              <FieldRow label="Project" value={p.areaName} says={`Area ${p.areaName}`} onPress={() => setOpen("project")} />
            ) : (
              <FieldRow label="Project" value="None" quiet onPress={() => setOpen("project")} />
            )}
          </CardRow>
          {task.projectId && p.headings && p.headings.length > 0 && p.onHeading ? (
            <CardRow>
              <FieldRow label="Heading" value={heading?.title ?? "None"} quiet={!heading} onPress={() => setOpen("heading")} />
            </CardRow>
          ) : null}
          <CardRow>
            <FieldRow label="Repeat" value={repeat ?? "Never"} quiet={!repeat} onPress={() => setOpen("repeat")} />
          </CardRow>
          <CardRow>
            <FieldRow label="If missed" value={MISS_POLICIES.find((m) => m.value === task.missPolicy)?.label ?? ""} onPress={() => setOpen("missed")} />
          </CardRow>
        </Card>

        <StepList
          items={p.checklist ?? []}
          onAdd={p.onChecklistAdd}
          onToggle={p.onChecklistToggle}
          onRename={p.onChecklistRename}
          onRemove={p.onChecklistRemove}
          onReorder={p.onChecklistReorder}
          onConvert={p.onConvert && can.convert ? p.onConvert : undefined}
        />

        <TagBox tags={p.tags ?? []} allTags={p.allTags ?? []} onAdd={p.onTagAdd} onRemove={p.onTagRemove} inputRef={tagInput} />

        <SectionLabel label="Notes" />
        <Card style={styles.notesCard}>
          {/* The note is Markdown; here it is edited as the plain text it is stored as, and saved when the box is left. */}
          <TextInput
            accessibilityLabel="Notes"
            placeholder="Anything worth remembering."
            placeholderTextColor={c.ink4}
            value={notes.draft}
            onChangeText={notes.setDraft}
            onFocus={notes.onFocus}
            onBlur={notes.onBlur}
            multiline
            textAlignVertical="top"
            style={[styles.notes, { color: c.ink }]}
          />
        </Card>

        {carried ? <Text style={[styles.carried, { color: c.ink3 }]}>{carried}</Text> : null}
      </Screen>

      {/* Complete first; Someday, Drop and the rest fold into the menu so the footer fits at 360 points. */}
      <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.line, paddingBottom: insets.bottom + 8 }]}>
        <Button variant="primary" label={done ? "Reopen" : "Complete"} onPress={done ? p.onReopen : p.onComplete} style={styles.complete} />
        {more.length > 0 ? <IconButton icon="more" label="More actions" onPress={() => setOpen("more")} /> : null}
      </View>

      <DoSheet open={open === "do"} task={task} now={p.now} zone={p.zone} today={today} exceptions={p.exceptions} asks={asks} onPatch={onPatch} onSeriesDay={p.onSeriesDay} onClose={close} />
      <DateSheet open={open === "deadline"} title="Deadline" value={task.deadline} now={p.now} zone={p.zone} today={today} onChange={(d) => onPatch({ deadline: d })} onClose={close} />
      <DateSheet open={open === "start"} title="Starts" value={task.startDate} now={p.now} zone={p.zone} today={today} onChange={(d) => onPatch({ startDate: d })} onClose={close} />
      <EstimateSheet open={open === "estimate"} value={task.estimateMin} onChange={(m) => onPatch({ estimateMin: m })} onClose={close} />
      <EstimateSheet open={open === "took"} title="Took" value={p.took ?? null} clear="Not recorded" onChange={(m) => p.onTook?.(m)} onClose={close} />
      <PrioritySheet open={open === "priority"} value={task.priority} onChange={(priority) => onPatch({ priority })} onClose={close} />
      <ProjectSheet open={open === "project"} projectId={task.projectId} areaId={task.areaId ?? null} projects={p.projects} areas={p.areas ?? []} onProject={(projectId) => onPatch({ projectId })} onArea={(areaId) => onPatch({ areaId })} onClose={close} />
      <HeadingSheet open={open === "heading"} headingId={task.headingId} headings={p.headings ?? []} onChange={(id) => p.onHeading?.(id)} onClose={close} />
      <RepeatSheet
        open={open === "repeat" || open === "pause"}
        pauseFirst={open === "pause"}
        task={task}
        today={today}
        onPatch={onPatch}
        onChangeRule={p.onChangeRule}
        onSkipOccurrence={p.onSkipOccurrence}
        onPause={p.onPause}
        onResume={p.onResume}
        onClose={close}
      />
      <MissedSheet open={open === "missed"} value={task.missPolicy} onChange={(missPolicy) => onPatch({ missPolicy })} onClose={close} />
      <MoreSheet open={open === "more"} actions={more} onClose={close} />
    </View>
  );
}

/** A task that is not on the device: finished long ago, dropped and gone, or an address that was never a task. */
export function TaskMissingView({ onBack }: { onBack: () => void }) {
  return (
    <Screen title="Task" back>
      <Empty title="This task is not on this phone." line="It may have been finished a while ago, or removed. Anything you finished is kept safe in your account.">
        <Button label="Back" onPress={onBack} style={styles.backButton} />
      </Empty>
    </Screen>
  );
}

/** While the task is being read from the phone's database: the frame, so Back is there at once. */
export function TaskOpeningView() {
  const c = useColours();
  return (
    <Screen title="Task" back>
      <Text style={[styles.opening, { color: c.ink3 }]}>Opening…</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gap: { height: 14 },
  head: { flexDirection: "row", alignItems: "flex-start", paddingRight: 14 },
  ringTarget: { width: 52, minHeight: 56, alignItems: "center", justifyContent: "center" },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.6, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, minHeight: 56, paddingTop: 15, paddingBottom: 13, paddingHorizontal: 0, fontFamily: font.semibold, fontSize: 20, lineHeight: 26 },
  struck: { textDecorationLine: "line-through" },
  notesCard: { paddingHorizontal: 16, paddingVertical: 6 },
  notes: { minHeight: 96, paddingVertical: 8, paddingHorizontal: 0, fontFamily: font.regular, fontSize: 17, lineHeight: 24 },
  carried: { marginTop: 16, marginHorizontal: 22, fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 10, paddingLeft: 16, paddingRight: 8, borderTopWidth: StyleSheet.hairlineWidth },
  complete: { flex: 1 },
  backButton: { alignSelf: "flex-start", marginTop: 10 },
  opening: { marginHorizontal: 22, fontFamily: font.regular, fontSize: 17 },
});
