// The Plan my day preview as the phone draws it (SCREENS.md §2.6a; the web's is features/planning/plan-preview.tsx):
// each proposed block with its time, its title and the sentence that explains it; "Didn't fit" with one-tap Tomorrow
// and Someday; the plan's earlier blocks that approving would replace, each with Keep; what was left out, with Put
// back; the buffer line; then Approve, Approve some, Shuffle and Discard as a 2 × 2 grid. `dock` is the sheet over
// Today's Day view (the bottom 62 % of the screen at most, so the day stays in sight above it); `inline` is a card
// (the morning plan's last step). What it says and what Approve writes are the web's own rules, used as they are
// (../../../../src/features/planning/use-plan-proposal.ts): nothing is written until Approve.
import { useEffect, useRef } from "react";
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { explain } from "@/core/planning";
import { formatMinutes, formatTime, timeFromMinutes } from "@/core/time";
import { DIDNT_FIT_LABEL, LEFT_OUT_LABEL, PROPOSED_LABEL, partOf, planRange, replacesLine, usePlanProposal, type PlanProposalModel, type PlanProposalOptions, type PlanWriter } from "@/features/planning/use-plan-proposal";
import { Button } from "~/ui/button";
import { CheckBox } from "~/ui/check-box";
import { Icon } from "~/ui/icon";
import { TARGET, font, useColours, useShadows } from "~/ui/theme";

export type PlanLayout = "dock" | "inline";

export interface PlanPreviewViewProps {
  /** The proposal with its own state: what the shared hook returns. */
  m: PlanProposalModel;
  layout: PlanLayout;
  /** Titles for the day's existing blocks, for the "replaces" line. */
  blockTitles?: ReadonlyMap<string, string>;
  /** Didn't fit's Tomorrow and Someday, and Keep on an earlier plan block. */
  writer: Pick<PlanWriter, "tomorrow" | "someday" | "keep">;
  /** Why blocking is paused; the preview still shows, Approve does not. */
  paused?: string | null;
  onClose: () => void;
  /** The docked sheet's height, so the day can be scrolled clear of it. */
  onHeight?: (height: number) => void;
}

export function PlanPreviewView({ m, layout, blockTitles, writer, paused, onClose, onHeight }: PlanPreviewViewProps) {
  const c = useColours();
  const shadows = useShadows();
  const dock = layout === "dock";
  const { proposal, blocks } = m;

  const list = (
    <>
      {blocks.length > 0 ? (
        <View accessibilityLabel={PROPOSED_LABEL}>
          {blocks.map((b, i) => {
            const when = planRange(b.start, b.end);
            return (
              <View key={b.key} testID="plan-block" style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                {m.choosing ? (
                  <View style={styles.tick}>
                    <CheckBox checked={!m.unticked.has(b.key)} onChange={() => m.toggle(b.key)} accessibilityLabel={`Include ${b.title}${partOf(b)}, ${when}`} />
                  </View>
                ) : null}
                <View style={styles.rowBody}>
                  <Text style={[styles.title, { color: c.ink }]}>
                    <Text style={[styles.when, { color: c.ink2 }]}>{when}  </Text>
                    {b.title}
                    {b.part ? <Text style={{ color: c.ink3 }}>{partOf(b)}</Text> : null}
                  </Text>
                  <Text style={[styles.reason, { color: c.ink2 }]}>{explain(b.reasons)}</Text>
                </View>
                {/* Removing takes the whole task out of this plan; its later parts go with the first. */}
                {m.removable.includes(b.key) ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${b.title} from the plan`} onPress={() => m.remove(b.taskId)} style={styles.remove}>
                    <Icon name="close" size={16} color={c.ink2} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {proposal && proposal.unplaced.length > 0 ? (
        <View style={styles.part}>
          <Text accessibilityRole="header" style={[styles.label, { color: c.ink3 }]}>
            {DIDNT_FIT_LABEL.toUpperCase()}
            <Text style={{ color: c.ink }}> {proposal.unplaced.length}</Text>
          </Text>
          <View accessibilityLabel={DIDNT_FIT_LABEL}>
            {proposal.unplaced.map((u, i) => (
              <View key={u.taskId} testID="plan-unplaced" style={[styles.unplaced, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <Text style={[styles.title, { color: c.ink }]}>
                  {u.title} <Text style={[styles.minutes, { color: c.ink3 }]}>· {formatMinutes(u.minutes)}</Text>
                </Text>
                <Text style={[styles.reason, { color: c.ink2 }]}>{explain(u.reason)}</Text>
                <View style={styles.moves}>
                  <Button variant="quiet" label="Tomorrow" accessibilityLabel={`Move ${u.title} to tomorrow`} onPress={() => void writer.tomorrow(u.taskId)} />
                  <Button variant="quiet" label="Someday" accessibilityLabel={`Move ${u.title} to Someday`} onPress={() => void writer.someday(u.taskId)} />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {m.replaced.length > 0 ? (
        <View style={[styles.part, styles.box, { backgroundColor: c.surface2 }]}>
          <Text style={[styles.reason, { color: c.ink2 }]}>{replacesLine(m.replaced.length)}</Text>
          {m.replaced.map((b) => {
            const name = blockTitles?.get(b.id) ?? "Block";
            return (
              <View key={b.id} style={styles.line}>
                <Text numberOfLines={1} style={[styles.lineText, { color: c.ink }]}>
                  <Text style={{ color: c.ink2 }}>{planRange(b.start, b.end)}</Text> · {name}
                </Text>
                <Button variant="quiet" label="Keep" accessibilityLabel={`Keep ${name} at ${formatTime(timeFromMinutes(b.start))}`} onPress={() => void writer.keep(b.id)} />
              </View>
            );
          })}
        </View>
      ) : null}

      {m.removedTasks.length > 0 ? (
        <View accessibilityLabel={LEFT_OUT_LABEL} style={styles.part}>
          {m.removedTasks.map((t) => (
            <View key={t.id} style={styles.line}>
              <Text numberOfLines={1} style={[styles.lineText, { color: c.ink2 }]}>
                Left out: {t.title}
              </Text>
              <Button variant="quiet" label="Put back" accessibilityLabel={`Put ${t.title} back in the plan`} onPress={() => m.putBack(t.id)} />
            </View>
          ))}
        </View>
      ) : null}

      {m.bufferLine ? <Text style={[styles.reason, styles.part, { color: c.ink2 }]}>{m.bufferLine}</Text> : null}
      {m.note ? (
        <Text accessibilityLiveRegion="polite" style={[styles.reason, styles.small, { color: c.ink2 }]}>
          {m.note}
        </Text>
      ) : null}
      {m.error ? (
        <Text accessibilityRole="alert" style={[styles.reason, styles.small, { color: c.deadline }]}>
          {m.error}
        </Text>
      ) : null}
      {paused ? <Text style={[styles.reason, styles.small, styles.box, { color: c.ink2, backgroundColor: c.surface2 }]}>{paused}</Text> : null}
    </>
  );

  const head = (
    <View style={styles.head}>
      <Text accessibilityRole="header" style={[styles.heading, { color: c.ink }]}>
        {m.title}
      </Text>
      <Text accessibilityLiveRegion="polite" style={[styles.reason, { color: c.ink2 }]}>
        {m.summary}
      </Text>
    </View>
  );

  const buttons = (
    <View style={[styles.buttons, { borderTopColor: c.line }]}>
      {m.allowed ? <Button variant="primary" label={m.approveLabel} disabled={m.busy || m.chosen.length === 0} onPress={() => void m.approve()} style={styles.button} /> : null}
      {m.allowed ? (
        <Button variant="secondary" label="Approve some" disabled={m.busy || blocks.length === 0} onPress={m.toggleChoosing} style={[styles.button, m.choosing && { borderColor: c.ink, backgroundColor: c.surface2 }]} accessibilityLabel={m.choosing ? "Approve some, on" : "Approve some"} />
      ) : null}
      <Button variant="secondary" label="Shuffle" disabled={m.busy || blocks.length === 0} onPress={m.shuffle} style={styles.button} />
      <Button variant="quiet" label="Discard" disabled={m.busy} onPress={onClose} style={styles.button} />
    </View>
  );

  if (!dock) {
    return (
      <View testID="plan-preview" style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }]}>
        {head}
        <View style={styles.body}>{list}</View>
        {buttons}
      </View>
    );
  }
  return (
    <View testID="plan-preview" onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)} style={[styles.dock, { backgroundColor: c.surface, borderColor: c.lineStrong, boxShadow: shadows.float ?? undefined }]}>
      <View aria-hidden style={[styles.grabber, { backgroundColor: c.lineStrong }]} />
      {head}
      <ScrollView style={[styles.scroll, { borderTopColor: c.line }]} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {list}
      </ScrollView>
      {buttons}
    </View>
  );
}

export interface PlanPreviewPanelProps extends PlanProposalOptions {
  layout: PlanLayout;
  blockTitles?: ReadonlyMap<string, string>;
  onHeight?: (height: number) => void;
}

/**
 * The preview with its proposal: the shared hook plans from `base` (no database here, so the browser preview and the
 * tests hand it a made-up day), and the view draws what it returns. The phone's Back closes it, as Escape does on the
 * web, unless a save is under way.
 */
export function PlanPreviewPanel(p: PlanPreviewPanelProps) {
  const m = usePlanProposal(p);
  const live = useRef({ busy: m.busy, onClose: p.onClose });
  useEffect(() => {
    live.current = { busy: m.busy, onClose: p.onClose };
  });
  useEffect(() => {
    // Only a phone has the key (the browser preview has none to listen for).
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!live.current.busy) live.current.onClose();
      return true;
    });
    return () => sub.remove();
  }, []);
  return <PlanPreviewView m={m} layout={p.layout} blockTitles={p.blockTitles} writer={p.writer} paused={p.paused} onClose={p.onClose} onHeight={p.onHeight} />;
}

const styles = StyleSheet.create({
  // A sheet docked over the Day view, so the day stays in sight above it.
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "62%", borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8 },
  card: { marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 6 },
  head: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 8, gap: 2 },
  heading: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26 },
  scroll: { flexShrink: 1, borderTopWidth: StyleSheet.hairlineWidth },
  body: { paddingHorizontal: 18, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 4 },
  tick: { marginLeft: -12 },
  rowBody: { flex: 1, paddingVertical: 8 },
  title: { fontFamily: font.medium, fontSize: 17, lineHeight: 23 },
  when: { fontFamily: font.medium, fontSize: 14, fontVariant: ["tabular-nums"] },
  minutes: { fontFamily: font.regular, fontSize: 14, fontVariant: ["tabular-nums"] },
  reason: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  remove: { width: TARGET, height: TARGET, marginRight: -12, alignItems: "center", justifyContent: "center" },
  part: { marginTop: 12 },
  small: { marginTop: 8 },
  label: { fontFamily: font.semibold, fontSize: 13, letterSpacing: 1.3, fontVariant: ["tabular-nums"] },
  unplaced: { paddingTop: 8 },
  moves: { flexDirection: "row", marginLeft: -12 },
  box: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: TARGET },
  lineText: { flex: 1, fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  button: { flexGrow: 1, flexBasis: "45%" },
});
