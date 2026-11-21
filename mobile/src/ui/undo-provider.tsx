// Undo on the phone (PRODUCT_SPEC.md §7 rule 3; DECISIONS.md "Redo"): the twin of the web's undo-provider.tsx, over
// the same context, history and redo capture (../../../src/features/undo, ../../../src/data/repositories). Every
// shared repository records its inverse here, so a write made on the phone can be taken back as on the web: a toast
// with Undo for the ones a person might regret, and after an undo a toast that offers Redo. A phone has no ⌘Z; the
// toast is the way. A completion's toast also asks how long the task took (took-chips.tsx), as the web's does.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { redoable } from "@/data/repositories/redo-capture";
import type { TookAsk, UndoRecord } from "@/data/repositories/undo";
import { UndoContext, type UndoApi } from "@/features/undo/undo-context";
import { UndoHistory, redoneWords, undoneWords, type UndoEntry } from "@/features/undo/undo-stack";
import { TARGET, font, useColours, useShadows } from "./theme";
import { TookChips } from "./took-chips";

/** Ten seconds to change your mind, as on the web. */
export const TOAST_MS = 10_000;

interface ToastState {
  text: string;
  action: "Undo" | "Redo";
  /** One task was finished: the toast also asks how long it took. */
  took?: TookAsk;
}

export function UndoProvider({ children, bottom = 68 }: { children: ReactNode; /** How far above the phone's bottom inset the toast floats: over the tab bar by default. */ bottom?: number }) {
  const c = useColours();
  const shadows = useShadows();
  const insets = useSafeAreaInsets();
  const db = useLocalDatabase() as LocalDatabase | null | undefined;
  const [depth, setDepth] = useState({ canUndo: false, canRedo: false });
  const [history] = useState(() => new UndoHistory((h) => setDepth((d) => (d.canUndo === h.canUndo && d.canRedo === h.canRedo ? d : { canUndo: h.canUndo, canRedo: h.canRedo }))));
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((next: ToastState | null) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(next);
    if (next) timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  // A toast that is being answered waits: a press on one of its chips gives it its full time back (WCAG 2.2.1).
  const holdToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  const say = useCallback((words: string) => AccessibilityInfo.announceForAccessibility(words), []);

  const record = useCallback(
    (raw: UndoEntry | UndoRecord) => {
      const entry: UndoEntry = "rows" in raw ? (db ? redoable(db, raw) : { label: raw.label, toast: raw.toast, announce: raw.announce, undo: raw.undo }) : raw;
      history.record(entry);
      if (entry.toast) showToast({ text: entry.label, action: "Undo", took: "rows" in raw ? raw.took : undefined });
      const words = entry.announce ?? (entry.toast ? entry.label : "");
      if (words) say(words);
    },
    [db, history, showToast, say],
  );

  const undo = useCallback(async () => {
    if (!history.canUndo) return false;
    showToast(null);
    const done = await history.undo();
    if (!done) return false;
    if (done.redoable) {
      showToast({ text: undoneWords(done.entry), action: "Redo" });
      say(undoneWords(done.entry));
    }
    return true;
  }, [history, showToast, say]);

  const redo = useCallback(async () => {
    if (!history.canRedo) return false;
    showToast(null);
    const back = await history.redo();
    if (!back) return false;
    if (back.toast) showToast({ text: back.label, action: "Undo" });
    say(redoneWords(back));
    return true;
  }, [history, showToast, say]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const api = useMemo<UndoApi>(() => ({ record, undo, redo, canUndo: depth.canUndo, canRedo: depth.canRedo }), [record, undo, redo, depth]);

  return (
    <UndoContext.Provider value={api}>
      {children}
      {toast && (
        <View pointerEvents="box-none" style={[styles.frame, { bottom: insets.bottom + bottom }]}>
          <View style={[styles.toast, { backgroundColor: c.surface, borderColor: c.lineStrong, boxShadow: shadows.fab ?? undefined }]}>
            <View style={styles.line}>
              <Text numberOfLines={2} style={[styles.text, { color: c.ink }]}>
                {toast.text}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel={toast.action} onPress={() => void (toast.action === "Redo" ? redo() : undo())} style={styles.action}>
                <Text style={[styles.actionText, { color: c.ink }]}>{toast.action}</Text>
              </Pressable>
            </View>
            {/* Keyed by the toast, so the chips of one completion never answer for the next. */}
            {toast.took ? <TookChips key={`${toast.took.table}:${toast.took.id}`} ask={toast.took} onTouch={holdToast} /> : null}
          </View>
        </View>
      )}
    </UndoContext.Provider>
  );
}

const styles = StyleSheet.create({
  frame: { position: "absolute", left: 16, right: 16, alignItems: "flex-start" },
  toast: { maxWidth: "100%", minHeight: 54, borderWidth: 1, borderRadius: 16, justifyContent: "center", overflow: "hidden" },
  line: { flexDirection: "row", alignItems: "center", paddingLeft: 16 },
  text: { flexShrink: 1, fontFamily: font.medium, fontSize: 15, lineHeight: 20, paddingVertical: 8 },
  action: { minHeight: TARGET, paddingHorizontal: 16, justifyContent: "center" },
  actionText: { fontFamily: font.semibold, fontSize: 15 },
});
