// Search's older results as the phone draws them (DECISIONS.md, amendment 2026-11-14; the web's features/finished/
// older-found.tsx): the phone searches the tasks it holds, which includes a week of finished ones; what was finished
// before that is kept on the server and searched there only when asked. A quiet button under the results, then the
// matches with the day each was finished, Reopen on each (one finished day of a repeat has none), and more a page at
// a time. A tap on a row opens the read-only view of it. Presentational: the rows and the asking are handed in.
import { StyleSheet, Text, View } from "react-native";
import type { FinishedStatus } from "@/features/finished/use-finished";
import { ActionLine } from "~/ui/action-line";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { SectionLabel } from "~/ui/section-label";
import { font, useColours } from "~/ui/theme";

export interface OlderRow {
  id: string;
  title: string;
  /** Where and when: "Acme · Tue 3 Nov". */
  detail: string;
  /** False for one finished day of a repeating task. */
  reopens: boolean;
}

export interface OlderFoundViewProps {
  rows: readonly OlderRow[];
  status: FinishedStatus;
  /** Whether there is another page: unknown (null) until the first answer. */
  more: boolean | null;
  onLoad: () => void;
  onOpen: (id: string) => void;
  onReopen: (id: string) => void;
}

export function OlderFoundView(p: OlderFoundViewProps) {
  const c = useColours();
  const asked = p.more !== null || p.status !== "idle";
  return (
    <View accessibilityLabel="Finished earlier">
      {asked ? <SectionLabel label="Finished earlier" count={p.rows.length} /> : null}
      {p.rows.length > 0 ? (
        <Card>
          {p.rows.map((row, i) => (
            <CardRow key={row.id} first={i === 0}>
              <ActionLine title={row.title} detail={row.detail} mark="done" onPress={() => p.onOpen(row.id)} action={row.reopens ? { label: "Reopen", accessibilityLabel: `Reopen ${row.title}`, onPress: () => p.onReopen(row.id) } : undefined} />
            </CardRow>
          ))}
        </Card>
      ) : null}
      <View style={styles.foot}>
        {p.status === "error" ? (
          <Text accessibilityRole="alert" style={[styles.words, { color: c.ink2 }]}>
            Couldn’t search older tasks. Check the connection and try again.
          </Text>
        ) : null}
        {p.more === false ? (
          p.rows.length === 0 ? (
            <Text style={[styles.words, { color: c.ink3 }]}>Nothing older matches.</Text>
          ) : null
        ) : (
          <Button label={p.status === "loading" ? "Searching…" : asked ? "Show more" : "Search older finished tasks"} disabled={p.status === "loading"} onPress={p.onLoad} style={styles.button} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  foot: { marginHorizontal: 16, marginTop: 14, gap: 8, alignItems: "flex-start" },
  words: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginHorizontal: 4 },
  button: { alignSelf: "flex-start" },
});
