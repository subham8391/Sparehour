// A note drawn as Markdown on the phone (PRODUCT_SPEC.md §6 "Notes", SCREENS.md §9–§10; the web's is
// ../../../src/ui/markdown.tsx). The reading is the web's own parser (../../../src/core/markdown/parse.ts): headings,
// paragraphs, emphasis, lists and checkbox lists, links, inline code, code blocks, quotes and rules. This file only
// draws what it returns. Nothing is ever HTML: a raw tag in a note is text. A link is one only when the parser let its
// address through the allow-list (http, https, mailto), and it opens outside the app. A `- [ ]` box is drawn and
// never a control: the checklist is the tickable list (DECISIONS.md "Note checkboxes").
import { openURL } from "expo-linking";
import type { ReactNode } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./text";
import { BOX_WORDS, parseBlocks, parseInline, type Block, type Inline } from "@/core/markdown/parse";
import { Icon } from "./icon";
import { font, useColours, type Colours } from "./theme";

/** The addresses a link may open, checked again where it is opened: nothing else ever leaves the app from a note. */
const OPENS = /^(https?:|mailto:)/i;

/** Opens a note's link outside the app (the browser, the mail app); an address off the allow-list is not opened. */
export function openNoteLink(href: string): void {
  if (!OPENS.test(href)) return;
  void openURL(href).catch(() => undefined);
}

interface Draw {
  c: Colours;
  onOpenLink: (href: string) => void;
}

function inline(runs: readonly Inline[], key: string, d: Draw): ReactNode[] {
  return runs.map((run, n) => {
    const k = `${key}.${n}`;
    switch (run.kind) {
      case "text":
        return run.text;
      case "code":
        return (
          <Text key={k} style={[styles.code, { backgroundColor: d.c.surface2 }]}>
            {run.text}
          </Text>
        );
      case "strong":
        return (
          <Text key={k} style={styles.strong}>
            {inline(run.children, k, d)}
          </Text>
        );
      case "em":
        return (
          <Text key={k} style={styles.em}>
            {inline(run.children, k, d)}
          </Text>
        );
      case "struck":
        return (
          <Text key={k} style={styles.struck}>
            {inline(run.children, k, d)}
          </Text>
        );
      case "link":
        return (
          <Text key={k} accessibilityRole="link" onPress={() => d.onOpenLink(run.href)} style={[styles.link, { color: d.c.ink, textDecorationColor: d.c.lineStrong }]}>
            {inline(run.children, k, d)}
          </Text>
        );
    }
  });
}

/** A paragraph's or an item's lines: a line break in the note is a line break here. */
function lines(ls: readonly string[], key: string, d: Draw): ReactNode[] {
  return ls.flatMap((l, i) => (i === 0 ? inline(parseInline(l), `${key}.${i}`, d) : ["\n", ...inline(parseInline(l), `${key}.${i}`, d)]));
}

function blocks(list: readonly Block[], key: string, d: Draw, quiet = false): ReactNode[] {
  const ink = quiet ? d.c.ink2 : d.c.ink;
  return list.map((b, i) => {
    const k = `${key}.${i}`;
    switch (b.kind) {
      case "heading":
        return (
          <Text key={k} accessibilityRole="header" style={[styles.text, HEADING[b.level], { color: b.level === 3 ? d.c.ink2 : ink }]}>
            {inline(parseInline(b.text), k, d)}
          </Text>
        );
      case "paragraph":
        return (
          <Text key={k} style={[styles.text, { color: ink }]}>
            {lines(b.lines, k, d)}
          </Text>
        );
      case "code":
        return (
          // A long line scrolls sideways rather than wrap, as on the web.
          <ScrollView key={k} horizontal showsHorizontalScrollIndicator={false} style={[styles.pre, { backgroundColor: d.c.surface2 }]} contentContainerStyle={styles.preBody}>
            <Text style={[styles.preText, { color: d.c.ink }]}>{b.text}</Text>
          </ScrollView>
        );
      case "quote":
        return (
          <View key={k} style={[styles.quote, { borderLeftColor: d.c.lineStrong }]}>
            {blocks(b.blocks, k, d, true)}
          </View>
        );
      case "rule":
        return <View key={k} aria-hidden style={[styles.rule, { backgroundColor: d.c.line }]} />;
      case "list":
        return (
          <View key={k} style={styles.list}>
            {b.items.map((it, j) => (
              <View key={`${k}.${j}`} style={styles.item}>
                {it.checked !== null ? <NoteBox checked={it.checked} c={d.c} /> : <Text style={[styles.text, styles.marker, { color: d.c.ink3 }]}>{b.ordered ? `${b.start + j}.` : "•"}</Text>}
                <View style={styles.itemBody}>
                  <Text style={[styles.text, { color: it.checked ? d.c.ink3 : ink }, it.checked ? styles.struck : null]}>{lines(it.lines, `${k}.${j}`, d)}</Text>
                  {it.children.length > 0 ? <View style={styles.nested}>{blocks(it.children, `${k}.${j}`, d, quiet)}</View> : null}
                </View>
              </View>
            ))}
          </View>
        );
    }
  });
}

/** A `- [ ]` box: drawn, never a control; its state is read out as a word, as on the web. */
function NoteBox({ checked, c }: { checked: boolean; c: Colours }) {
  return (
    <View accessible accessibilityLabel={checked ? BOX_WORDS.done : BOX_WORDS.todo} style={styles.boxLine}>
      <View style={[styles.box, { borderColor: c.lineControl }]}>{checked ? <Icon name="check" size={11} color={c.ink2} strokeWidth={2.4} /> : null}</View>
    </View>
  );
}

/** A note as rendered Markdown. `onOpenLink` is handed an address already on the allow-list; left out, it opens outside the app. */
export function Markdown({ source, onOpenLink = openNoteLink }: { source: string; onOpenLink?: (href: string) => void }) {
  const c = useColours();
  return <View style={styles.note}>{blocks(parseBlocks(source), "b", { c, onOpenLink })}</View>;
}

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

const HEADING = {
  1: { fontFamily: font.semibold, fontSize: 18, lineHeight: 25 },
  2: { fontFamily: font.semibold, fontSize: 16, lineHeight: 23 },
  3: { fontFamily: font.medium, fontSize: 16, lineHeight: 23 },
} as const;

const styles = StyleSheet.create({
  note: { gap: 8 },
  text: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  strong: { fontFamily: font.semibold },
  em: { fontStyle: "italic" },
  struck: { textDecorationLine: "line-through" },
  link: { textDecorationLine: "underline" },
  code: { fontFamily: MONO, fontSize: 14.5 },
  pre: { borderRadius: 6, flexGrow: 0 },
  preBody: { paddingHorizontal: 12, paddingVertical: 8 },
  preText: { fontFamily: MONO, fontSize: 14, lineHeight: 20 },
  quote: { gap: 8, borderLeftWidth: 2, paddingLeft: 12 },
  rule: { height: StyleSheet.hairlineWidth },
  list: { gap: 4 },
  item: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  itemBody: { flex: 1, minWidth: 0 },
  marker: { minWidth: 16, textAlign: "right", fontVariant: ["tabular-nums"] },
  nested: { marginTop: 4, gap: 4 },
  // The box sits on the first line of its words.
  boxLine: { height: 23, justifyContent: "center" },
  box: { width: 15, height: 15, borderRadius: 3, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
