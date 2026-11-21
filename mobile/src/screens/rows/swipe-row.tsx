// A row's swipe on the phone (DESIGN_SYSTEM.md §5 Task row: "right = advance, left = push away; Drop never on a full
// swipe"; the web's is features/tasks/swipe-layer.tsx). A finger that travels clearly sideways slides the row and
// shows that side's actions under it as named buttons a row tall; letting go past the reveal point leaves them open
// (a touch on the row closes them, and so does another row opening), past the commit point runs the first one (never
// Drop), short of either springs back. A vertical scroll is the list's: the gesture gives up as soon as the finger
// goes more down than across. How far counts, when letting go commits and which actions may run on a full swipe are
// the web's own (features/tasks/swipe.ts); only the gesture and the drawing are the phone's. Each button runs what
// the row's ⋯ runs under the same name (row-menu.ts), so no action is the gesture's alone.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { BUTTON_W, LOCK, SLOP, TAP_ONLY, commitAt, release, type SwipeSide } from "@/features/tasks/swipe";
import { font, useColours } from "~/ui/theme";
import type { SwipeButton, SwipeProps } from "./rows-context";

/** The slide back and forth, as the web's (200 ms); the phone's own reduce-motion setting cuts it. */
const SLIDE_MS = 200;

/** The gesture's name for a test that drives it. */
export const SWIPE_TEST_ID = "row-swipe";

/** What is showing under the row: the side, its buttons, whether it rests open and whether letting go would run the first. */
interface Shown {
  side: SwipeSide;
  buttons: readonly SwipeButton[];
  open: boolean;
  full: boolean;
}

/** One row rests open at a time: the next one to open closes it. */
let closeOpen: (() => void) | null = null;

const fullOk = (first: SwipeButton | undefined): boolean => Boolean(first) && !TAP_ONLY.has(first?.label ?? "");

export function SwipeRow({ right, left, enabled, children }: SwipeProps) {
  const c = useColours();
  const tx = useSharedValue(0);
  const [shown, setShown] = useState<Shown | null>(null);
  const width = useRef(0);
  /** Where the row rests (0 when shut), and where it sat when the finger came down. */
  const opened = useRef(0);
  const from = useRef(0);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The gesture stays put for the row's life; what it reads is always the latest render's.
  const latest = useRef({ right, left });
  useEffect(() => {
    latest.current = { right, left };
  });

  const shutNow = useCallback(() => {
    opened.current = 0;
    if (closeOpen === shutNow) closeOpen = null;
    tx.value = withTiming(0, { duration: SLIDE_MS });
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => setShown(null), SLIDE_MS);
  }, [tx]);
  useEffect(
    () => () => {
      if (hide.current) clearTimeout(hide.current);
      if (closeOpen === shutNow) closeOpen = null;
    },
    [shutNow],
  );
  // Rows being ticked do not swipe: one that was resting open closes.
  useEffect(() => {
    if (!enabled && opened.current !== 0) shutNow();
  }, [enabled, shutNow]);

  const config = useMemo(
    () => ({
      runOnJS: true,
      testID: SWIPE_TEST_ID,
      enabled,
      // Sideways wins only when the travel is clearly more across than down (swipe.ts: SLOP, LOCK); a scroll fails it.
      activeOffsetX: [-SLOP, SLOP] as [number, number],
      failOffsetY: [-SLOP / LOCK, SLOP / LOCK] as [number, number],
      onActivate: () => {
        if (hide.current) clearTimeout(hide.current);
        if (closeOpen && closeOpen !== shutNow) closeOpen();
        from.current = opened.current;
      },
      onUpdate: (e: { translationX: number }) => {
        const travel = from.current + e.translationX;
        const side: SwipeSide = travel >= 0 ? "right" : "left";
        const buttons = latest.current[side];
        // A side with nothing on it does not move.
        const dx = buttons.length > 0 ? travel : 0;
        tx.value = dx;
        const full = fullOk(buttons[0]) && Math.abs(dx) >= commitAt(width.current);
        setShown((s) => (s && s.side === side && s.full === full && !s.open && s.buttons === buttons ? s : { side, buttons, open: false, full }));
      },
      onDeactivate: (e: { translationX: number; canceled: boolean }) => {
        const travel = from.current + e.translationX;
        const side: SwipeSide = travel >= 0 ? "right" : "left";
        const buttons = latest.current[side];
        const dx = buttons.length > 0 ? travel : 0;
        // Taken away by the system (a scroll, another gesture): back to where it rested.
        const what = e.canceled ? (opened.current !== 0 ? "open" : "close") : release(dx, width.current, buttons.length, fullOk(buttons[0]));
        if (what === "commit") {
          shutNow();
          buttons[0]?.run();
        } else if (what === "open" && buttons.length > 0) {
          opened.current = (side === "right" ? 1 : -1) * BUTTON_W * buttons.length;
          closeOpen = shutNow;
          tx.value = withTiming(opened.current, { duration: SLIDE_MS });
          setShown({ side, buttons, open: true, full: false });
        } else shutNow();
      },
    }),
    [enabled, shutNow, tx],
  );
  const pan = usePanGesture(config);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const reveal = useAnimatedStyle(() => ({ width: Math.abs(tx.value) }));

  return (
    <View testID="row-swipe-frame" style={styles.clip} onLayout={(e) => (width.current = e.nativeEvent.layout.width)}>
      {shown && shown.buttons.length > 0 ? (
        // The first action sits at the outer edge, where the finger is heading.
        <Animated.View style={[styles.actions, shown.side === "right" ? styles.atLeft : styles.atRight, reveal]}>
          {shown.buttons.map((b, i) => {
            const first = i === 0 && !TAP_ONLY.has(b.label);
            return (
              <Pressable
                key={b.label}
                accessibilityRole="button"
                accessibilityLabel={b.label}
                // Not a target until the row rests open; every action is in the ⋯ too.
                disabled={!shown.open}
                aria-hidden={!shown.open}
                onPress={() => {
                  shutNow();
                  b.run();
                }}
                // The side's first action (what a full swipe runs) in ink; Drop stays ink text, never a warning. Past
                // the commit point the first action takes the row: letting go runs it.
                style={[styles.button, { backgroundColor: first ? c.ink : c.surface2, flexGrow: i === 0 && shown.full ? 6 : 1 }]}
              >
                <Text numberOfLines={1} style={[styles.buttonText, { color: first ? c.paper : c.ink }]}>
                  {b.label}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={slide}>
          {children}
          {/* While it rests open, a touch on the row itself only closes it. */}
          {shown?.open ? <Pressable accessibilityRole="button" accessibilityLabel="Close the row’s actions" onPress={shutNow} style={StyleSheet.absoluteFill} /> : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  actions: { position: "absolute", top: 0, bottom: 0, overflow: "hidden" },
  atLeft: { left: 0, flexDirection: "row" },
  atRight: { right: 0, flexDirection: "row-reverse" },
  button: { flexBasis: BUTTON_W, flexShrink: 1, minWidth: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  buttonText: { fontFamily: font.medium, fontSize: 14 },
});
