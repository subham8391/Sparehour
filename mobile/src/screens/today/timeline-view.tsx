// "Your day" on the phone (SCREENS.md §2.6, §2.8; the web's is features/today/day-pane.tsx with timeline.tsx and
// block-tools.tsx): the 24 hours scrolling under a heading, opening on the working day, with hour lines, the hours
// outside the working day dimmed, meetings by name, blocks, the free gaps named, the now line, the projected finish
// and the overrun marker. There is no drag here; every drag has the web's own tap path:
//   - a tap on an empty time offers "New block here HH:MM", which opens "Add at HH:MM" (nothing written until Add);
//   - a tap on a block selects it and shows its tools: Open, Move…, Lock, Remove and ⋯ (Rename, Duplicate);
//   - Move… and Duplicate wait for a tap on the timeline, or for times set in a sheet;
//   - a task waiting for a time ("Block" on its row) is placed by the next tap.
// Presentational: it draws a TimelineShape (timeline-shape.ts) and says what was tapped; whoever mounts it writes.
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import { minuteAtOffset, stepZoom, type ZoomStep } from "@/core/blocking";
import type { Capacity } from "@/core/capacity";
import type { AddWhat, AddableTask } from "@/features/blocking/use-placing";
import type { PlanGhost } from "@/features/planning/drawing";
import type { TimelineBlock, TimelineMeeting } from "@/features/today/hooks/use-today";
import { hhmm, landing, offerAt, rangeLine } from "@/features/today/timeline-geometry";
import { Button } from "~/ui/button";
import { Icon } from "~/ui/icon";
import { TARGET, font, useColours, type Colours } from "~/ui/theme";
import { AddAtSheet } from "./add-at-sheet";
import { BlockMenuSheet, BlockRenameSheet, BlockTimesSheet } from "./block-sheets";
import { laneBox, timelineShape, type DrawnBlock, type DrawnMeeting } from "./timeline-shape";

/** The ruler's gutter, and how far inside it whatever is drawn on the day starts and ends. */
const GUTTER = 48;
const INSET = 4;
const EDGE = 8;
/** The room inside the hours' card, over midnight and under the day's last hour. */
const BOX_PAD = 10;

export interface TimelineViewProps {
  c: Capacity;
  /** The minute of the day it is (minuteOnDay), and whether now falls on the day drawn. */
  nowMin: number;
  nowShown: boolean;
  blocks: readonly TimelineBlock[];
  meetings: readonly TimelineMeeting[];
  zoom: ZoomStep;
  onZoom: (zoom: ZoomStep) => void;
  /** The working day the heading names, in minutes of the day, and the buffer beside it. */
  dayStart: number;
  dayEnd: number;
  bufferPct?: number;
  /** Blocking is paused, and why (PRODUCT_SPEC.md §10.3 rule 5). */
  note?: string | null;
  /** Nothing on the timeline yet and nothing being placed: say how blocks get there. */
  hint?: boolean;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
  /** A block moved by a tap after Move… or its From time: it keeps its length. */
  onMoveBlock?: (id: string, startMin: number) => void;
  /** New edges, from the From / To times. */
  onResizeBlock?: (id: string, startMin: number, endMin: number) => void;
  /** A copy at a new time: Duplicate, then a tap or a time. */
  onDuplicateBlock?: (id: string, startMin: number) => void;
  onRemoveBlock?: (id: string) => void;
  onToggleLock?: (id: string, locked: boolean) => void;
  onOpenTask?: (taskId: string) => void;
  onRenameBlock?: (id: string, title: string) => void;
  /** "Add at": a block for a task, or one of your own under a name. Without it a tap on an empty time offers nothing. */
  onAddBlock?: (what: AddWhat, startMin: number, endMin: number) => void;
  /** The tasks that sheet offers; none, and it asks only for a name. */
  addable?: readonly AddableTask[];
  /** Tap-to-schedule: a task is waiting for a time; a tap on the timeline places it. */
  placing?: { title: string } | null;
  onTapSlot?: (startMin: number) => void;
  onCancelPlacing?: () => void;
  /** Plan my day's proposal while it is previewed (SCREENS.md §2.6a): drawn as ghosts, never written, and not tappable. */
  proposed?: readonly PlanGhost[];
  /** A meeting picked on the ribbon ("Show on timeline", SCREENS.md §2.2): the hours turn to it and it is outlined. Its start minute. */
  shownMeeting?: number | null;
  /** Room at the end of the hours for whatever floats over them. */
  bottomRoom?: number;
  /** Drawn over the hours and scrolling away with them: Today's hero, on a phone too short to keep it in view as well. */
  above?: ReactNode;
}

type Armed = { kind: "move" | "copy"; id: string };

const wash = (hex: string, alpha: number) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${alpha})`;

export function TimelineView(p: TimelineViewProps) {
  const c = useColours();
  const shape = timelineShape({ c: p.c, nowMin: p.nowMin, nowShown: p.nowShown, blocks: p.blocks, meetings: p.meetings, zoom: p.zoom });
  const { scale } = shape;
  const [offer, setOffer] = useState<number | null>(null);
  /** "Add at": the minute the sheet is open for. */
  const [adding, setAdding] = useState<number | null>(null);
  const [armed, setArmed] = useState<Armed | null>(null);
  const [timesOpen, setTimesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const selected = p.blocks.find((b) => b.id === p.selectedBlockId) ?? null;
  const armedBlock = armed ? p.blocks.find((b) => b.id === armed.id) : undefined;
  // A selection that moved on takes its waiting Move… and its quiet note with it.
  const [seenSelection, setSeenSelection] = useState(p.selectedBlockId ?? null);
  if ((p.selectedBlockId ?? null) !== seenSelection) {
    setSeenSelection(p.selectedBlockId ?? null);
    setNote(null);
    setMenuOpen(false);
    if (armed && armed.id !== p.selectedBlockId) {
      setArmed(null);
      setTimesOpen(false);
    }
  }
  if (armed && !armedBlock) {
    setArmed(null);
    setTimesOpen(false);
  }

  // ---- the scroll: opening on the working day (or on now once it is well under way), keeping now (or the minute at
  // the top) in view when the zoom changes, and turning to the first free time ahead when a task starts waiting.
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  /** How far it is scrolled, how tall the window on the hours is, and where the day starts inside what scrolls. */
  const offset = useRef(0);
  const room = useRef(0);
  const dayTop = useRef(0);
  const turned = useRef<number | null>(null);
  const turn = (minute: number) => {
    offset.current = dayTop.current + Math.max(0, minute) * scale;
    scroller.current?.scrollTo({ y: offset.current, animated: false });
  };
  const turnRef = useRef(turn);
  useEffect(() => {
    turnRef.current = turn;
  });
  // The first time the day has a place, it is turned to the morning (or to now).
  const placed = (y: number) => {
    dayTop.current = y;
    if (turned.current !== null) return;
    turned.current = scale;
    // A meeting asked for before the hours were drawn is where they open.
    turn(p.shownMeeting != null ? p.shownMeeting - 30 : shape.openAt);
  };
  const shownMeeting = p.shownMeeting ?? null;
  useEffect(() => {
    if (shownMeeting !== null && turned.current !== null) turnRef.current(shownMeeting - 30);
  }, [shownMeeting]);
  useEffect(() => {
    const before = turned.current;
    if (before === null || before === scale) return;
    turned.current = scale;
    turnRef.current(p.nowShown ? p.nowMin - room.current / scale / 3 : (offset.current - dayTop.current) / before);
    // Only the zoom turns it again: the minute that passes must not pull the hours from under a finger.
  }, [scale]); // eslint-disable-line react-hooks/exhaustive-deps
  const waitingFor = p.placing?.title ?? null;
  useEffect(() => {
    if (waitingFor === null || shape.freeAt === null || turned.current === null) return;
    const top = dayTop.current + shape.freeAt * scale - offset.current;
    // Left alone when a good part of it already shows.
    if (top < 0 || top > room.current / 2) turnRef.current(shape.freeAt - room.current / scale / 4);
  }, [waitingFor]); // eslint-disable-line react-hooks/exhaustive-deps

  const arm = (kind: Armed["kind"]) => {
    if (!selected) return;
    if (kind === "move" && selected.locked) {
      // A locked block stays where it is (PRODUCT_SPEC.md §10.2): a quiet reason, nothing else.
      setNote("Locked — unlock it to move it");
      return;
    }
    if (kind === "copy" ? !p.onDuplicateBlock : !p.onMoveBlock) return;
    setOffer(null);
    setArmed({ kind, id: selected.id });
  };
  const sendTimes = (kind: Armed["kind"], from: number, to: number) => {
    if (!selected) return;
    setArmed(null);
    setTimesOpen(false);
    // What is read out is where it lands: a move or a copy keeps its length, snapped to five minutes.
    const at = landing(kind, selected, from, to);
    if (at.how === "copy") p.onDuplicateBlock?.(selected.id, from);
    else if (at.how === "resize") p.onResizeBlock?.(selected.id, at.start, at.end);
    else p.onMoveBlock?.(selected.id, from);
    AccessibilityInfo.announceForAccessibility(at.said);
  };
  const waiting = Boolean(p.placing || armed);
  const onTap = (y: number) => {
    const minute = minuteAtOffset(y, scale, 0);
    if (armed) {
      sendTimes(armed.kind, minute, minute + ((armedBlock?.end ?? 0) - (armedBlock?.start ?? 0)));
      return;
    }
    if (p.placing && p.onTapSlot) {
      p.onTapSlot(minute);
      return;
    }
    // A tap on an empty time with nothing selected offers a block there; any other tap lets go.
    if (p.onAddBlock && !p.selectedBlockId && offer === null) {
      setOffer(offerAt(minute));
      return;
    }
    setOffer(null);
    p.onSelectBlock?.(null);
  };

  const bar = armed && armedBlock ? (armed.kind === "move" ? `Tap a new time for “${armedBlock.title}”` : `Tap a time for a copy of “${armedBlock.title}”`) : null;
  const canMove = Boolean(p.onMoveBlock);
  return (
    <View style={styles.fill}>
      <View style={styles.head}>
        <View style={styles.headWords}>
          <Text accessibilityRole="header" style={[styles.heading, { color: c.ink }]}>
            Your day
          </Text>
          <Text style={[styles.sub, { color: c.ink3 }]}>
            {hhmm(p.dayStart)} – {hhmm(p.dayEnd)}
            {p.bufferPct !== undefined ? ` · buffer ${p.bufferPct}%` : ""}
          </Text>
        </View>
        <ZoomControl zoom={p.zoom} onZoom={p.onZoom} c={c} />
      </View>
      {/* Blocking paused (PRODUCT_SPEC.md §10.3 rule 5): why, where the block would have been. */}
      {p.note ? (
        <Text accessibilityRole="text" style={[styles.note, { color: c.ink2, backgroundColor: c.surface2 }]}>
          {p.note}
        </Text>
      ) : null}
      {bar ? (
        <PlacingBar text={bar} onCancel={() => setArmed(null)} action={{ label: "Times…", accessibilityLabel: "Set the times", onPress: () => setTimesOpen(true) }} c={c} />
      ) : p.placing ? (
        <PlacingBar text={`Tap a time for “${p.placing.title}”`} onCancel={() => p.onCancelPlacing?.()} c={c} />
      ) : selected ? (
        <BlockTools
          block={selected}
          note={note}
          c={c}
          onOpen={selected.taskId && p.onOpenTask ? () => p.onOpenTask?.(selected.taskId as string) : undefined}
          onMove={canMove ? () => arm("move") : undefined}
          onToggleLock={p.onToggleLock ? () => p.onToggleLock?.(selected.id, !selected.locked) : undefined}
          onRemove={p.onRemoveBlock ? () => p.onRemoveBlock?.(selected.id) : undefined}
          onMore={p.onRenameBlock || canMove || p.onToggleLock || p.onRemoveBlock ? () => setMenuOpen(true) : undefined}
        />
      ) : p.hint ? (
        <Text style={[styles.hint, { color: c.ink3 }]}>Tap “Block” on a task, then a time here — or tap an empty time to add a task or a block of your own there.</Text>
      ) : null}
      <ScrollView
        ref={scroller}
        style={styles.fill}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: (p.bottomRoom ?? 0) + 16 }}
        onLayout={(e) => (room.current = e.nativeEvent.layout.height)}
        onScroll={(e) => (offset.current = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
      >
        {p.above}
        <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.line }]} onLayout={(e) => placed(e.nativeEvent.layout.y + BOX_PAD + 1)}>
          <View testID="timeline" style={{ height: shape.height }}>
            {/* The whole day takes the tap: where it fell is the minute. Everything drawn over it but a block lets the tap through. */}
            <Pressable
              testID="timeline-tap"
              accessibilityRole="button"
              accessibilityLabel={p.placing ? `Tap a time for ${p.placing.title}` : (bar ?? "The day’s hours. Tap an empty time to add a block there.")}
              accessibilityState={{ busy: waiting }}
              onPress={(e) => onTap(e.nativeEvent.locationY)}
              style={StyleSheet.absoluteFill}
            />
            {shape.outside.map((o) => (
              <View key={`o${o.top}`} aria-hidden testID="outside-hours" style={[styles.through, styles.outside, { top: o.top, height: o.height, backgroundColor: c.paper }]} />
            ))}
            {shape.rows.map((r) => (
              <View key={`r${r.minute}`} aria-hidden style={[styles.through, styles.line, { top: r.top, backgroundColor: c.line, opacity: r.half ? 0.55 : 0.3 }]}>
                {r.label ? <Text style={[styles.quarter, { color: c.ink3 }]}>{r.label}</Text> : null}
              </View>
            ))}
            {shape.hours.map((h) => (
              <View key={`h${h.minute}`} aria-hidden style={[styles.through, styles.hour, { top: h.top }]}>
                <View style={[styles.hourLine, { backgroundColor: c.line }]} />
                {h.label ? <Text style={[styles.hourLabel, { color: c.ink3 }]}>{h.label}</Text> : null}
              </View>
            ))}
            <View style={[styles.through, styles.drawn]}>
              {shape.gaps.map((g) => (
                <View key={g.key} testID="free-gap" style={[styles.gap, { top: g.top, height: g.height, backgroundColor: wash(c.spareFill, 0.14) }]}>
                  <Text style={[styles.gapText, { color: c.spare }]}>{g.label}</Text>
                </View>
              ))}
              {shape.meetings.map((m) => (
                <Meeting key={m.key} m={m} c={c} shown={p.shownMeeting === m.start} />
              ))}
              {/* The proposal: a dashed outline over a thin wash, title and time inside; the panel lists them, so a screen reader skips these. */}
              {p.proposed?.map((g) => (
                <View key={g.key} aria-hidden testID="plan-ghost" style={[styles.ghost, { top: g.start * scale + 1, height: Math.max(24, (g.end - g.start) * scale - 2), borderColor: c.blockFill, backgroundColor: wash(c.blockFill, 0.06) }]}>
                  <Text numberOfLines={1} style={[styles.itemTitle, { color: c.ink }]}>
                    {g.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.itemTime, { color: c.ink2 }]}>
                    {rangeLine(g.start, g.end)}
                  </Text>
                </View>
              ))}
            </View>
            {/* Blocks take their own taps, so their layer lets the rest through to the day. */}
            <View style={[styles.boxNone, styles.drawn]}>
              {shape.blocks.map((b) => (
                <Block
                  key={b.block.id}
                  b={b}
                  c={c}
                  selected={p.selectedBlockId === b.block.id}
                  onSelect={() => {
                    setOffer(null);
                    p.onSelectBlock?.(b.block.id);
                  }}
                />
              ))}
              {offer !== null && (
                // A block where the tap was. Nothing is made yet; the sheet it opens asks what and how long.
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`New block here ${hhmm(offer)}`}
                  onPress={() => {
                    setOffer(null);
                    setAdding(offer);
                  }}
                  style={[styles.offer, { top: offer * scale, backgroundColor: c.surface, borderColor: c.lineStrong }]}
                >
                  <Text style={[styles.offerText, { color: c.ink }]}>
                    New block here <Text style={{ color: c.ink3 }}>{hhmm(offer)}</Text>
                  </Text>
                </Pressable>
              )}
            </View>
            {/* The working day's end, a shade firmer than an hour line. */}
            <View aria-hidden style={[styles.through, styles.line, { top: shape.workEnd, backgroundColor: c.lineStrong }]} />
            {shape.finish && (
              <View testID="done-by" style={[styles.through, styles.marker, { top: shape.finish.top }]}>
                <View style={[styles.dashed, { borderColor: c.spareFill }]} />
                <View style={[styles.pill, styles.pillFinish, { backgroundColor: c.spareSoft, borderColor: c.spareFill }]}>
                  <Text style={[styles.pillText, { color: c.spare }]}>{shape.finish.label}</Text>
                </View>
              </View>
            )}
            {shape.overrun && (
              <View testID="overrun" style={[styles.through, styles.pill, styles.pillOver, { top: shape.overrun.top, backgroundColor: c.overSoft, borderColor: c.overFill }]}>
                <Text style={[styles.pillText, { color: c.over }]}>{shape.overrun.label}</Text>
              </View>
            )}
            {shape.now && (
              <View testID="now-line" style={[styles.through, styles.marker, { top: shape.now.top }]}>
                <Text style={[styles.nowLabel, { color: c.ink }]}>{shape.now.label}</Text>
                <View style={[styles.nowLine, { backgroundColor: c.ink }]} />
                <View style={[styles.nowDot, { backgroundColor: c.ink }]} />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
      <AddAtSheet at={adding} tasks={p.addable ?? []} onAdd={(what, from, to) => p.onAddBlock?.(what, from, to)} onClose={() => setAdding(null)} />
      <BlockMenuSheet
        block={menuOpen ? selected : null}
        onOpen={selected?.taskId && p.onOpenTask ? () => p.onOpenTask?.(selected.taskId as string) : undefined}
        onToggleLock={selected && p.onToggleLock ? () => p.onToggleLock?.(selected.id, !selected.locked) : undefined}
        onRemove={selected && p.onRemoveBlock ? () => p.onRemoveBlock?.(selected.id) : undefined}
        onRename={selected && p.onRenameBlock ? () => setRenaming(selected.id) : undefined}
        onDuplicate={p.onDuplicateBlock ? () => arm("copy") : undefined}
        onClose={() => setMenuOpen(false)}
      />
      <BlockTimesSheet kind={timesOpen && armed ? armed.kind : null} block={armedBlock ?? null} onSend={sendTimes} onClose={() => setTimesOpen(false)} />
      <BlockRenameSheet block={p.blocks.find((b) => b.id === renaming) ?? null} onRename={(title) => renaming && p.onRenameBlock?.(renaming, title)} onClose={() => setRenaming(null)} />
    </View>
  );
}

function Meeting({ m, c, shown = false }: { m: DrawnMeeting; c: Colours; /** Picked on the ribbon: outlined for a moment. */ shown?: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={`Meeting: ${m.title}, ${m.time}${m.unanswered ? ", not answered yet" : ""}`}
      testID="meeting"
      accessibilityState={{ selected: shown }}
      style={[styles.item, m.tall ? styles.itemTall : styles.itemShort, laneBox(m.lane), { top: m.top, height: m.height, backgroundColor: c.surface, borderLeftColor: m.past ? c.lineStrong : c.meetFill }, shown && { borderWidth: 2, borderLeftWidth: 3, borderColor: c.meetFill }]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: wash(c.meetFill, m.past ? 0.1 : 0.2) }]} />
      {m.unanswered ? <View testID="meeting-unanswered" style={[StyleSheet.absoluteFill, styles.unanswered, { borderColor: c.meetFill }]} /> : null}
      <Text numberOfLines={1} style={[styles.itemTitle, { color: m.past ? c.ink3 : c.ink }]}>
        {m.title}
      </Text>
      <Text numberOfLines={1} style={[styles.itemTime, { color: c.ink2 }]}>
        {m.time}
      </Text>
    </View>
  );
}

function Block({ b, c, selected, onSelect }: { b: DrawnBlock; c: Colours; selected: boolean; onSelect: () => void }) {
  const { block } = b;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={b.says}
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={[styles.item, b.tall ? styles.itemTall : styles.itemShort, laneBox(b.lane), { top: b.top, height: b.height, backgroundColor: c.surface, borderLeftColor: b.quiet ? c.lineStrong : c.blockFill }, selected && { borderWidth: 2, borderLeftWidth: 3, borderColor: c.ink, borderLeftColor: c.ink }]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: wash(c.blockFill, b.quiet ? 0.08 : 0.16) }]} />
      <View style={styles.blockTitle}>
        {block.done ? <Icon name="check" size={11} color={c.ink3} strokeWidth={2.2} /> : null}
        {block.locked ? <Icon name="lock" size={11} color={b.quiet ? c.ink3 : c.ink} /> : null}
        <Text numberOfLines={1} style={[styles.itemTitle, styles.shrink, { color: b.quiet ? c.ink3 : c.ink }, block.done && styles.struck]}>
          {block.title}
        </Text>
        {/* "Will sync": a change still on its way; hollow when it cannot sync at all (SCREENS.md §2.7, §21). */}
        {block.sync ? <View aria-hidden testID={`sync-${block.sync}`} style={[styles.syncDot, block.sync === "will" ? { backgroundColor: c.ink3 } : { borderWidth: 1, borderColor: c.ink3 }]} /> : null}
      </View>
      <Text numberOfLines={1} style={[styles.itemTime, { color: c.ink2 }]}>
        {b.time}
      </Text>
    </Pressable>
  );
}

/** The selected block's tools, over the hours rather than on them, so they never cover the time being looked at. */
function BlockTools({ block, note, c, onOpen, onMove, onToggleLock, onRemove, onMore }: { block: TimelineBlock; note: string | null; c: Colours; onOpen?: () => void; onMove?: () => void; onToggleLock?: () => void; onRemove?: () => void; onMore?: () => void }) {
  return (
    <View testID="block-tools" style={[styles.tools, { backgroundColor: c.surface, borderColor: c.lineStrong }]}>
      <Text numberOfLines={1} accessibilityLiveRegion={note ? "polite" : "none"} style={[styles.toolsTitle, { color: note ? c.ink2 : c.ink }]}>
        {note ?? `${block.title} · ${rangeLine(block.start, block.end)}`}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.toolsRow}>
        {onOpen ? <Button variant="quiet" label="Open" accessibilityLabel="Open task" onPress={onOpen} style={styles.tool} /> : null}
        {onMove ? <Button variant="quiet" label="Move…" accessibilityLabel={`Move ${block.title} to another time`} onPress={onMove} style={styles.tool} /> : null}
        {onToggleLock ? <Button variant="quiet" label={block.locked ? "Unlock" : "Lock"} onPress={onToggleLock} style={styles.tool} /> : null}
        {onRemove ? <Button variant="quiet" label="Remove" onPress={onRemove} style={styles.tool} /> : null}
        {onMore ? (
          <Pressable accessibilityRole="button" accessibilityLabel="More block actions" onPress={onMore} style={styles.more}>
            <Icon name="more" size={20} color={c.ink2} strokeWidth={2.4} />
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** The bar over the hours while something waits for a tap (SCREENS.md §2.8): what it is, and Cancel. */
export function PlacingBar({ text, onCancel, action, c }: { text: string; onCancel: () => void; action?: { label: string; accessibilityLabel: string; onPress: () => void }; c: Colours }) {
  return (
    <View accessibilityLiveRegion="polite" testID="placing-bar" style={[styles.placing, { backgroundColor: c.ink }]}>
      <Text numberOfLines={2} style={[styles.placingText, { color: c.paper }]}>
        {text}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.accessibilityLabel} onPress={action.onPress} style={styles.placingAction}>
          <Text style={[styles.placingActionText, { color: c.paper }]}>{action.label}</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} style={styles.placingAction}>
        <Text style={[styles.placingActionText, { color: c.paper }]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

/** The − / + control: the zoom's tap path, between rows of 30, 15 and 5 minutes. */
function ZoomControl({ zoom, onZoom, c }: { zoom: ZoomStep; onZoom: (zoom: ZoomStep) => void; c: Colours }) {
  return (
    <View accessibilityLabel="Timeline zoom" style={styles.zoom}>
      <Text style={[styles.zoomText, { color: c.ink3 }]}>{zoom}m rows</Text>
      {([-1, 1] as const).map((dir) => {
        const next = stepZoom(zoom, dir);
        const off = next === zoom;
        return (
          <Pressable key={dir} accessibilityRole="button" accessibilityLabel={dir === 1 ? "Zoom in" : "Zoom out"} accessibilityState={{ disabled: off }} disabled={off} onPress={() => onZoom(next)} style={styles.zoomButton}>
            <Text style={[styles.zoomSign, { color: off ? c.ink4 : c.ink2 }]}>{dir === 1 ? "+" : "−"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 20, marginTop: 12, marginBottom: 8 },
  headWords: { flex: 1 },
  heading: { fontFamily: font.displayMedium, fontSize: 20, lineHeight: 26 },
  sub: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"] },
  note: { marginHorizontal: 16, marginTop: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  hint: { marginHorizontal: 20, marginTop: 6, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  // The card the hours are drawn on, with room over midnight's label.
  box: { marginHorizontal: 16, borderWidth: 1, borderRadius: 18, paddingVertical: BOX_PAD, overflow: "hidden" },
  // Drawn over the day without taking its taps.
  through: { position: "absolute", pointerEvents: "none" },
  boxNone: { position: "absolute", pointerEvents: "box-none" },
  outside: { left: GUTTER, right: 0, opacity: 0.8 },
  line: { left: GUTTER, right: 0, height: StyleSheet.hairlineWidth },
  hour: { left: 0, right: 0, height: 1 },
  hourLine: { position: "absolute", left: GUTTER, right: 0, top: 0, height: 1 },
  hourLabel: { position: "absolute", left: 8, top: -8, width: GUTTER - 10, fontFamily: font.medium, fontSize: 11, lineHeight: 15, fontVariant: ["tabular-nums"] },
  quarter: { position: "absolute", left: 8 - GUTTER, top: -8, width: GUTTER - 10, fontFamily: font.regular, fontSize: 11, lineHeight: 15, fontVariant: ["tabular-nums"] },
  drawn: { top: 0, bottom: 0, left: GUTTER + INSET, right: EDGE },
  gap: { position: "absolute", left: 0, right: 0, borderRadius: 4, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  gapText: { fontFamily: font.semibold, fontSize: 13, fontVariant: ["tabular-nums"] },
  item: { position: "absolute", borderRadius: 4, borderLeftWidth: 3, paddingHorizontal: 8, overflow: "hidden" },
  itemTall: { paddingVertical: 4 },
  itemShort: { flexDirection: "row", alignItems: "center", gap: 6 },
  itemTitle: { fontFamily: font.semibold, fontSize: 13, lineHeight: 16 },
  itemTime: { fontFamily: font.regular, fontSize: 11, lineHeight: 15, fontVariant: ["tabular-nums"], flexShrink: 0 },
  shrink: { flexShrink: 1 },
  struck: { textDecorationLine: "line-through" },
  blockTitle: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  unanswered: { borderWidth: 1, borderStyle: "dashed", borderRadius: 4 },
  ghost: { position: "absolute", left: 0, right: 0, borderWidth: 1, borderStyle: "dashed", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  offer: { position: "absolute", left: 0, minHeight: TARGET, paddingHorizontal: 12, borderWidth: 1, borderStyle: "dashed", borderRadius: 10, justifyContent: "center", elevation: 3 },
  offerText: { fontFamily: font.medium, fontSize: 15, fontVariant: ["tabular-nums"] },
  marker: { left: 0, right: 0, height: 0 },
  // A dashed line on Android is a box with no room inside it and the same dashed border all round.
  dashed: { position: "absolute", left: GUTTER, right: 0, top: -1, height: 0, borderWidth: 1, borderRadius: 1, borderStyle: "dashed" },
  pill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, height: 20, justifyContent: "center" },
  pillFinish: { position: "absolute", left: 2, top: -10 },
  pillOver: { left: GUTTER + INSET },
  pillText: { fontFamily: font.medium, fontSize: 11, lineHeight: 15, fontVariant: ["tabular-nums"] },
  nowLabel: { position: "absolute", left: 8, top: -8, width: GUTTER - 10, fontFamily: font.semibold, fontSize: 11, lineHeight: 15, fontVariant: ["tabular-nums"] },
  nowLine: { position: "absolute", left: GUTTER - 6, right: 0, top: -1, height: 2 },
  nowDot: { position: "absolute", left: GUTTER - 8, top: -4.5, width: 9, height: 9, borderRadius: 4.5 },
  tools: { marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderRadius: 12, paddingTop: 8, paddingLeft: 12 },
  toolsTitle: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, paddingRight: 12, fontVariant: ["tabular-nums"] },
  toolsRow: { alignItems: "center", marginLeft: -12 },
  tool: { paddingHorizontal: 12 },
  more: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  placing: { marginHorizontal: 16, marginTop: 8, minHeight: TARGET, borderRadius: 12, paddingLeft: 14, paddingRight: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  placingText: { flex: 1, fontFamily: font.medium, fontSize: 15, lineHeight: 20, paddingVertical: 6 },
  placingAction: { minHeight: TARGET, paddingHorizontal: 10, justifyContent: "center" },
  placingActionText: { fontFamily: font.semibold, fontSize: 15, textDecorationLine: "underline" },
  zoom: { flexDirection: "row", alignItems: "center", marginRight: -10 },
  zoomText: { fontFamily: font.regular, fontSize: 12, marginRight: 2, fontVariant: ["tabular-nums"] },
  zoomButton: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  zoomSign: { fontFamily: font.medium, fontSize: 22, lineHeight: 26 },
});
