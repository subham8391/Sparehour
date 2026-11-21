// The selected block's sheets (SCREENS.md §2.6, §2.8; the web's are in features/today/block-tools.tsx): its menu
// (Open task, Lock or Unlock, Unblock or Delete, Rename, Duplicate), the From / To times that answer Move… or
// Duplicate without a tap on the timeline, and its name. Presentational: each says what was picked. How the times
// asked for become a move, a resize or a copy is the web's own rule (features/today/timeline-geometry.ts).
import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import type { TimelineBlock } from "@/features/today/hooks/use-today";
import { askedTimes, hhmm, rangeLine } from "@/features/today/timeline-geometry";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { FieldRow } from "~/ui/field-row";
import { MenuDivider, MenuRow } from "~/ui/menu-row";
import { Sheet } from "~/ui/sheet";
import { TextField } from "~/ui/text-field";
import { font, useColours } from "~/ui/theme";
import { TimePicker } from "~/ui/time-picker";

export interface BlockMenuProps {
  block: TimelineBlock | null;
  onOpen?: () => void;
  onToggleLock?: () => void;
  onRemove?: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onClose: () => void;
}

/** "More block actions": the web's block menu, in its order. */
export function BlockMenuSheet({ block, onOpen, onToggleLock, onRemove, onRename, onDuplicate, onClose }: BlockMenuProps) {
  const c = useColours();
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Sheet open={block !== null} title={block?.title} onClose={onClose} footer={<Button variant="quiet" label="Cancel" onPress={onClose} />}>
      {block ? <Text style={[styles.range, { color: c.ink3 }]}>{rangeLine(block.start, block.end)}</Text> : null}
      {block && onOpen ? <MenuRow label="Open task" onPress={run(onOpen)} /> : null}
      {block && onToggleLock ? <MenuRow label={block.locked ? "Unlock" : "Lock"} icon="lock" onPress={run(onToggleLock)} /> : null}
      {/* A task's block is let go of and the task stays; a block of your own has nothing else, so it is deleted. */}
      {block && onRemove ? <MenuRow label={block.taskId ? "Unblock" : "Delete"} onPress={run(onRemove)} /> : null}
      {(onRename || onDuplicate) && (onOpen || onToggleLock || onRemove) ? <MenuDivider /> : null}
      {block && onRename ? <MenuRow label="Rename" onPress={run(onRename)} /> : null}
      {block && onDuplicate ? <MenuRow label="Duplicate" onPress={run(onDuplicate)} /> : null}
    </Sheet>
  );
}

export interface BlockTimesProps {
  /** Move… or Duplicate is waiting; null while the sheet is shut. */
  kind: "move" | "copy" | null;
  block: TimelineBlock | null;
  /** The times asked for, in minutes of the day: a move keeping the length (only From changed), a resize, or where the copy goes. */
  onSend: (kind: "move" | "copy", from: number, to: number) => void;
  onClose: () => void;
}

/** From and To, each set with the app's time picker; a tap on the timeline still works while this is shut. */
export function BlockTimesSheet({ kind, block, onSend, onClose }: BlockTimesProps) {
  if (!kind || !block) return null;
  return <Times key={`${kind}:${block.id}:${block.start}:${block.end}`} kind={kind} block={block} onSend={onSend} onClose={onClose} />;
}

function Times({ kind, block, onSend, onClose }: { kind: "move" | "copy"; block: TimelineBlock; onSend: BlockTimesProps["onSend"]; onClose: () => void }) {
  const c = useColours();
  const [from, setFrom] = useState(hhmm(block.start));
  const [to, setTo] = useState(hhmm(block.end));
  const [picking, setPicking] = useState<"from" | "to" | null>(null);
  const [refused, setRefused] = useState(false);
  const send = () => {
    const asked = askedTimes(kind, block, from, to);
    if (!asked) return setRefused(true);
    onSend(kind, asked.from, asked.to);
  };
  const title = kind === "move" ? `Move ${block.title}` : `Copy ${block.title}`;
  if (picking) {
    return (
      <Sheet open title={picking === "from" ? "Start time" : "End time"} onClose={() => setPicking(null)} footer={<Button variant="quiet" label="Back" onPress={() => setPicking(null)} />}>
        <TimePicker
          value={picking === "from" ? from : to}
          onSet={(value) => {
            if (value) (picking === "from" ? setFrom : setTo)(value);
            setRefused(false);
            setPicking(null);
          }}
        />
      </Sheet>
    );
  }
  return (
    <Sheet
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" label="Cancel" onPress={onClose} />
          <Button variant="primary" label={kind === "move" ? "Move" : "Copy"} onPress={send} />
        </>
      }
    >
      <Card style={styles.fields}>
        <CardRow first>
          <FieldRow label="From" value={from} says={`Start time ${from}`} onPress={() => setPicking("from")} />
        </CardRow>
        {kind === "move" && (
          <CardRow>
            <FieldRow label="To" value={to} says={`End time ${to}`} onPress={() => setPicking("to")} />
          </CardRow>
        )}
      </Card>
      <Text style={[styles.note, { color: c.ink3 }]}>
        {refused ? "The end has to be after the start." : kind === "move" ? "A new start moves it and keeps its length. A new end makes it longer or shorter." : "The copy keeps this block’s length."}
      </Text>
    </Sheet>
  );
}

export interface BlockRenameProps {
  block: TimelineBlock | null;
  onRename: (title: string) => void;
  onClose: () => void;
}

export function BlockRenameSheet({ block, onRename, onClose }: BlockRenameProps) {
  if (!block) return null;
  return <Rename key={block.id} block={block} onRename={onRename} onClose={onClose} />;
}

function Rename({ block, onRename, onClose }: { block: TimelineBlock; onRename: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState(block.title);
  const save = () => {
    onClose();
    // As on the web: a name that only gained or lost a space at its ends is the same name.
    if (title.trim() !== block.title) onRename(title);
  };
  return (
    <Sheet
      open
      title="Rename block"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" label="Cancel" onPress={onClose} />
          <Button variant="primary" label="Save" onPress={save} />
        </>
      }
    >
      <TextField accessibilityLabel="Block name" value={title} onChangeText={setTitle} autoFocus selectTextOnFocus maxLength={120} returnKeyType="done" onSubmitEditing={save} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  range: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, marginTop: -6, fontVariant: ["tabular-nums"] },
  // The sheet's body has its own 20 points at each side.
  fields: { marginHorizontal: 0 },
  note: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
});
