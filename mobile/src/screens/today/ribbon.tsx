// The hero card (SCREENS.md §2.2; DESIGN_SYSTEM.md §5; the web's is features/today/ribbon.tsx): the spare-time figure
// with what is beside it, then the day drawn as an instrument, by the hour. The track is spare time; meetings sit on
// it in the meeting colour and blocks in the block colour, an invitation not yet answered is hatched, what has gone
// is hatched too, a 2-point ink mark is now and a dashed one the projected finish, with hour ticks and one row of
// labels under it; a day that is over grows an amber tail past its end. The drawing is hidden from a screen reader:
// the words above it say everything. Presentational: it is handed a Summary (today-summary.ts) and a RibbonShape
// (ribbon-shape.ts).
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "~/ui/card";
import { TARGET, font, useColours, type Colours } from "~/ui/theme";
import type { Summary } from "../today-summary";
import { labelsFor, type RibbonShape } from "./ribbon-shape";

export interface HeroProps {
  summary: Summary;
  /** The day's drawing; null on a day without working hours. */
  ribbon: RibbonShape | null;
  /** Opens Trim today: the over sentence becomes its button, and a day well over offers it by name. */
  onTrim?: () => void;
  /** "Plan your day" on an empty today. */
  onPlan?: () => void;
  /** Without a calendar, the meetings line is the way to connect one. */
  onConnect?: () => void;
}

export function Hero({ summary, ribbon, onTrim, onPlan, onConnect }: HeroProps) {
  const c = useColours();
  if (summary.kind === "none") {
    if (!summary.line) return null;
    return (
      <Card style={styles.hero}>
        <Text style={[styles.heroNote, { color: c.ink2 }]}>{summary.line}</Text>
      </Card>
    );
  }
  const over = summary.kind === "over";
  const dot = <Text style={{ color: c.ink4 }}> · </Text>;
  return (
    <Card style={styles.hero}>
      <Text accessibilityLabel={`${summary.figure} ${over ? "over" : "spare"}`} accessibilityHint={summary.spoken} style={[styles.figure, { color: summary.level ? c.ink2 : c.ink }]}>
        {summary.figure} <Text style={[styles.unit, { color: over ? c.over : c.spare }]}>{over ? "over" : "spare"}</Text>
      </Text>
      <Text style={[styles.heroLine, { color: c.ink2 }]}>
        {summary.planned}
        {dot}
        {summary.meetings.kind === "connect" && onConnect ? (
          <Text accessibilityRole="link" onPress={onConnect} style={[styles.link, { textDecorationColor: c.lineStrong }]}>
            {summary.meetings.text}
          </Text>
        ) : (
          summary.meetings.text
        )}
        {summary.finish ? (
          <>
            {dot}
            <Text style={[styles.strong, { color: c.spare }]}>{summary.finish}</Text>
          </>
        ) : null}
        {summary.planLink && onPlan ? (
          <>
            {dot}
            <Text accessibilityRole="link" onPress={onPlan} style={[styles.link, styles.medium, { color: c.ink, textDecorationColor: c.lineStrong }]}>
              Plan your day
            </Text>
          </>
        ) : null}
        {summary.over && !onTrim ? (
          <>
            {dot}
            <Text style={[styles.strong, { color: c.over }]}>{summary.over}</Text>
          </>
        ) : null}
      </Text>
      {/* Tapping the sentence opens Trim today (PRODUCT_SPEC.md §9.4 "Over"): a question, never an alarm. */}
      {summary.over && onTrim ? (
        <Pressable accessibilityRole="button" accessibilityLabel={summary.over} onPress={onTrim} style={styles.overButton}>
          <Text style={[styles.heroLine, styles.strong, styles.link, { color: c.over, textDecorationColor: c.overFill }]}>{summary.over}</Text>
        </Pressable>
      ) : null}
      {ribbon ? <RibbonTrack shape={ribbon} c={c} /> : null}
      {summary.outside ? <Text style={[styles.heroLine, { color: c.ink2 }]}>{summary.outside}</Text> : null}
      {summary.wellOver && onTrim ? (
        <View style={styles.wellOver}>
          <Text style={[styles.heroLine, styles.wellOverText, { color: c.ink2 }]}>{summary.wellOver}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Trim today" onPress={onTrim} style={styles.trim}>
            <Text style={[styles.heroLine, styles.medium, styles.link, { color: c.ink, textDecorationColor: c.lineStrong }]}>Trim today</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

const TRACK = 16;
/** One line of the hatch every this many points. */
const HATCH_STEP = 6;

/** Diagonal lines over a stretch of the track: the hours gone, or an invitation not yet answered. Clipped by its parent. */
function Hatch({ width, colour }: { width: number; colour: string }) {
  if (width <= 0) return null;
  const lines = Math.ceil((width + TRACK) / HATCH_STEP);
  return (
    <>
      {Array.from({ length: lines }, (_, i) => (
        <View key={i} style={[styles.hatchLine, { left: i * HATCH_STEP - TRACK / 2, backgroundColor: colour }]} />
      ))}
    </>
  );
}

/** The instrument itself, on its own, so another screen can draw the same day (the morning plan's hero does on the web). */
export function RibbonTrack({ shape, c }: { shape: RibbonShape; c: Colours }) {
  // The day's own width in points, for the hatches and for which labels a narrow track keeps.
  const [width, setWidth] = useState(0);
  const pct = (n: number) => `${n}%` as const;
  return (
    <View aria-hidden testID="ribbon" style={styles.ribbon}>
      <View style={styles.day} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.trackFrame}>
          <View style={[styles.track, { backgroundColor: c.spareSoft }]}>
            {shape.segments.map((s, i) =>
              s.kind === "unanswered" ? (
                // Still busy, hatched so it reads as not yet decided (SYSTEM_DESIGN.md §5.4).
                <View key={i} testID="ribbon-unanswered" style={[styles.segment, styles.clip, { left: pct(s.left), width: pct(s.width) }]}>
                  <Hatch width={(width * s.width) / 100} colour={c.surface} />
                </View>
              ) : (
                <View key={i} testID={`ribbon-${s.kind}`} style={[styles.segment, { left: pct(s.left), width: pct(s.width), backgroundColor: s.kind === "meeting" ? c.meetFill : c.blockFill }]} />
              ),
            )}
            {shape.elapsed > 0 && (
              <View testID="ribbon-elapsed" style={[styles.elapsed, styles.clip, { width: pct(shape.elapsed), backgroundColor: c.surface2 }]}>
                <Hatch width={(width * shape.elapsed) / 100} colour={c.lineStrong} />
              </View>
            )}
          </View>
          {/* Both marks overhang the track by 4 points, so a 16-point track still shows them. */}
          {shape.finish !== null && <View testID="ribbon-finish" style={[styles.finish, { left: pct(shape.finish), borderColor: c.spareFill }]} />}
          {shape.now !== null && <View testID="ribbon-now" style={[styles.now, { left: pct(shape.now), backgroundColor: c.ink, borderColor: c.surface }]} />}
        </View>
        <View style={styles.ticks}>
          {shape.ticks.map((t) => (
            <View key={t} style={[styles.tick, { left: pct(t), backgroundColor: c.lineStrong }]} />
          ))}
        </View>
        <View style={styles.labels}>
          {labelsFor(shape, width).map((l) => (
            <View key={l.key} style={[styles.labelBox, { left: pct(l.left) }, l.align === "start" ? styles.labelStart : l.align === "end" ? styles.labelEnd : styles.labelCentre]}>
              <Text numberOfLines={1} style={[styles.label, l.kind === "now" ? { color: c.ink, fontFamily: font.semibold } : l.kind === "finish" ? { color: c.spare, fontFamily: font.semibold } : { color: c.ink3 }]}>
                {l.text}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {shape.tail > 0 && <View testID="ribbon-tail" style={[styles.tail, { width: pct(shape.tail), backgroundColor: c.overSoft, borderColor: c.overFill }]} />}
    </View>
  );
}

const LABEL_BOX = 48;

const styles = StyleSheet.create({
  hero: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 16, gap: 8 },
  heroNote: { fontFamily: font.medium, fontSize: 17 },
  figure: { fontFamily: font.bold, fontSize: 38, lineHeight: 44, letterSpacing: -0.6, fontVariant: ["tabular-nums"] },
  unit: { fontFamily: font.semibold, fontSize: 22, letterSpacing: 0 },
  heroLine: { fontFamily: font.medium, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  strong: { fontFamily: font.semibold },
  medium: { fontFamily: font.medium },
  link: { textDecorationLine: "underline" },
  overButton: { minHeight: TARGET, justifyContent: "center", marginVertical: -6 },
  wellOver: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8 },
  wellOverText: { flexShrink: 1 },
  trim: { minHeight: TARGET, justifyContent: "center", paddingHorizontal: 4 },
  ribbon: { flexDirection: "row", marginTop: 6 },
  day: { flex: 1 },
  trackFrame: { height: TRACK, marginVertical: 4 },
  track: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 5, overflow: "hidden" },
  segment: { position: "absolute", top: 0, bottom: 0, borderRadius: 3 },
  clip: { overflow: "hidden" },
  elapsed: { position: "absolute", top: 0, bottom: 0, left: 0, opacity: 0.72 },
  hatchLine: { position: "absolute", top: -TRACK / 2, width: 1.5, height: TRACK * 2, transform: [{ rotate: "45deg" }] },
  // A dashed line on Android is a box with no room inside it and the same dashed border all round.
  finish: { position: "absolute", top: -4, bottom: -4, width: 0, marginLeft: -1, borderWidth: 1, borderRadius: 1, borderStyle: "dashed" },
  now: { position: "absolute", top: -4, bottom: -4, width: 4, marginLeft: -2, borderRadius: 2, borderWidth: 1 },
  ticks: { height: 6 },
  tick: { position: "absolute", top: 0, width: 1, height: 5 },
  labels: { height: 16, marginTop: 1 },
  labelBox: { position: "absolute", top: 0, width: LABEL_BOX },
  labelStart: { alignItems: "flex-start" },
  labelCentre: { alignItems: "center", marginLeft: -LABEL_BOX / 2 },
  labelEnd: { alignItems: "flex-end", marginLeft: -LABEL_BOX },
  label: { fontFamily: font.medium, fontSize: 11, lineHeight: 15, fontVariant: ["tabular-nums"] },
  tail: { minWidth: 3, height: TRACK, marginTop: 4, borderWidth: 1, borderLeftWidth: 0, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
});
