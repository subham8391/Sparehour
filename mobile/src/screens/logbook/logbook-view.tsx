// The Logbook as the phone draws it (SCREENS.md §8): what was finished, newest first, by the day it was finished on,
// each day's dropped tasks folded under it. A finished row's ring reopens it and a dropped row offers Restore; one
// finished day of a repeat offers neither. The filters sit behind a Filter button with the active ones as removable
// chips, and "Show older" asks the server for what was finished before the week the device holds. `expired` set, it
// is the list Review on Today's expired digest opens instead. Presentational: it is handed everything it shows.
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LogbookDay, LogbookEntry } from "@/app/(app)/logbook/logbook-days";
import type { LogbookFilterKey } from "@/app/(app)/logbook/logbook-filters";
import { formatMinutes, type LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import type { FinishedStatus } from "@/features/finished/use-finished";
import { ActionLine } from "~/ui/action-line";
import { Button } from "~/ui/button";
import { Card, CardRow } from "~/ui/card";
import { CollapsedGroup } from "~/ui/collapsed-group";
import { Empty } from "~/ui/empty";
import { Icon } from "~/ui/icon";
import { Screen } from "~/ui/screen";
import { SectionLabel } from "~/ui/section-label";
import { TaskRow } from "~/screens/rows/task-row";
import { TARGET, font, useColours, type Colours } from "~/ui/theme";

/** Where "Show older" stands (features/finished/use-finished.ts). */
export interface OlderState {
  /** False where the server keeps no older tasks yet: there is then no way to ask. */
  available: boolean;
  status: FinishedStatus;
  /** Whether there is another page: unknown (null) until the first answer. */
  more: boolean | null;
  /** How many older rows have come so far. */
  count: number;
}

export interface LogbookViewProps {
  today: LocalDate;
  defaultEstimateMin: number;
  /** The days after the filters, newest first. */
  days: readonly LogbookDay[];
  /** Whether the Logbook holds anything at all before the filters (the filter bar shows only then, or while filtering). */
  hasAny: boolean;
  /** The device has been read and has nothing finished or dropped. */
  empty: boolean;
  /** A shutdown's rating and highlight, by day ("2026-11-20" → "Rated 4/5 · Highlight: shipped the deck"). */
  dayLines: ReadonlyMap<string, string>;
  /** The oldest day shown while there is more to fetch: its count would be of part of it, so it shows none. */
  partDay: string | null;
  projectNames: ReadonlyMap<string, string>;
  /** The rows that came from the server, by key: true where one can be reopened (false for one day of a repeat). */
  olderRows: ReadonlyMap<string, boolean>;
  /** The active filters as chips, oldest first. */
  filterChips: readonly { key: LogbookFilterKey; label: string }[];
  /** "Dropped only" is asked for: the dropped rows are the list, open rather than folded. */
  droppedOnly: boolean;
  /** Null when there is nothing older to ask for (Dropped only, or the expired list). */
  older: OlderState | null;
  /** Only the tasks the rollover expired, each with Restore; null for the Logbook itself. */
  expired?: readonly LogbookEntry[] | null;
  /** The dropped tasks are still being read: the expired list says nothing yet rather than "Nothing expired." */
  loading?: boolean;
  onOpenFilters: () => void;
  onRemoveFilter: (key: LogbookFilterKey) => void;
  onClearFilters: () => void;
  onLoadOlder: () => void;
  onOpen: (entry: LogbookEntry) => void;
  onReopen: (entry: LogbookEntry) => void;
  onRestore: (entry: LogbookEntry) => void;
  onWholeLogbook?: () => void;
}

export function LogbookView(p: LogbookViewProps) {
  const c = useColours();
  const filtering = p.filterChips.length > 0;

  const row = (e: LogbookEntry, first: boolean) => {
    const project = e.task.projectId ? p.projectNames.get(e.task.projectId) : undefined;
    // How long it took, when the person said, before the time it was finished.
    const detail = [e.expired ? "Expired" : null, project, e.tookMin != null ? `took ${formatMinutes(e.tookMin)}` : null, e.at].filter(Boolean).join(" · ");
    const older = p.olderRows.get(e.key);
    const reopens = older === undefined ? e.kind === "done" : older;
    return (
      <CardRow key={e.key} first={first}>
        {e.kind === "dropped" ? (
          // A dropped task has no ring to press: Restore is its ⋯ and its right swipe, as on the web.
          <TaskRow task={e.task} today={p.today} defaultEstimateMin={p.defaultEstimateMin} meta={detail} onOpen={() => p.onOpen(e)} actions={[{ label: "Restore", run: () => p.onRestore(e) }]} />
        ) : reopens ? (
          // The ring reopens; so do the ⋯ and a right swipe. A task the server kept is listed, not ticked for a bulk edit.
          <TaskRow task={e.task} today={p.today} defaultEstimateMin={p.defaultEstimateMin} meta={detail} done onComplete={() => p.onReopen(e)} onOpen={() => p.onOpen(e)} actions={[{ label: "Reopen", run: () => p.onReopen(e) }]} selectable={older === undefined} />
        ) : (
          // One finished day of a repeating task: it opens, and is not a task to reopen.
          <ActionLine title={e.task.title} detail={detail} mark="done" onPress={() => p.onOpen(e)} />
        )}
      </CardRow>
    );
  };
  const list = (entries: readonly LogbookEntry[]) => <Card>{entries.map((e, i) => row(e, i === 0))}</Card>;

  if (p.expired) {
    return (
      <Screen title="Expired" eyebrow="Logbook" back>
        <Text style={[styles.subtitle, { color: c.ink2 }]}>Time-sensitive tasks the day moved past. Restore brings one back.</Text>
        {p.expired.length === 0 ? (
          p.loading ? null : (
            <Empty title="Nothing expired." />
          )
        ) : (
          <>
            <SectionLabel label="Dropped" count={p.expired.length} />
            {list(p.expired)}
          </>
        )}
        {p.onWholeLogbook ? <Button variant="quiet" label="The whole Logbook" onPress={p.onWholeLogbook} style={styles.whole} /> : null}
      </Screen>
    );
  }

  const subtitle = p.olderRows.size > 0 ? "The last week and older" : p.hasAny ? "The last week" : null;
  return (
    <Screen title="Done" eyebrow="Logbook" back>
      {subtitle ? <Text style={[styles.subtitle, { color: c.ink2 }]}>{subtitle}</Text> : null}
      {p.hasAny || filtering ? (
        <View style={styles.filters}>
          <Button
            label={filtering ? `Filter · ${p.filterChips.length}` : "Filter"}
            accessibilityLabel={filtering ? `Filter, ${p.filterChips.length} on` : "Filter"}
            icon={<Icon name="sliders" size={18} color={c.ink3} />}
            onPress={p.onOpenFilters}
            style={styles.filterButton}
          />
          {filtering ? (
            <View style={styles.chips}>
              {p.filterChips.map((f) => (
                <View key={f.key} style={[styles.chip, { borderColor: c.lineControl }]}>
                  <Text numberOfLines={1} style={[styles.chipText, { color: c.ink }]}>
                    {f.label}
                  </Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove filter ${f.label}`} onPress={() => p.onRemoveFilter(f.key)} style={styles.chipRemove}>
                    <Icon name="close" size={14} color={c.ink3} />
                  </Pressable>
                </View>
              ))}
              {p.filterChips.length > 1 ? <Button variant="quiet" label="Clear all" onPress={p.onClearFilters} /> : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {p.empty && !filtering ? (
        <>
          <View style={styles.book}>
            <Icon name="book" size={22} color={c.ink3} />
          </View>
          <Empty title="Nothing finished this week." line={p.older?.available ? "What you finished before that is kept." : "What you finish shows here."} />
        </>
      ) : filtering && p.days.length === 0 ? (
        <Empty title="Nothing here matches those filters.">
          <Button variant="quiet" label="Clear the filters" onPress={p.onClearFilters} style={styles.emptyAction} />
        </Empty>
      ) : (
        p.days.map((d) => {
          const key = d.day.toString();
          const line = p.dayLines.get(key);
          return (
            <View key={key}>
              <SectionLabel label={formatDay(d.day, { weekday: "long", today: p.today })} detail={d.done.length > 0 && key !== p.partDay ? `${d.done.length} done · ${formatMinutes(d.minutes)}` : undefined} />
              {line ? <Text style={[styles.dayLine, { color: c.ink2 }]}>{line}</Text> : null}
              {d.done.length > 0 ? list(d.done) : null}
              {/* Asked for on their own, the dropped ones are the list; otherwise they stay folded under the day. */}
              {d.dropped.length > 0 ? (
                p.droppedOnly ? (
                  list(d.dropped)
                ) : (
                  <CollapsedGroup label="Dropped" count={d.dropped.length}>
                    {list(d.dropped)}
                  </CollapsedGroup>
                )
              ) : null}
            </View>
          );
        })
      )}
      {p.older ? <ShowOlder older={p.older} filtering={filtering} onLoad={p.onLoadOlder} c={c} /> : null}
    </Screen>
  );
}

/** The way to what was finished before the week the device holds: a page per press, and when there is no more. */
function ShowOlder({ older, filtering, onLoad, c }: { older: OlderState; filtering: boolean; onLoad: () => void; c: Colours }) {
  if (!older.available) return null;
  return (
    <View style={styles.older}>
      {older.status === "error" ? (
        <Text accessibilityRole="alert" style={[styles.olderText, { color: c.ink2 }]}>
          Couldn’t load older tasks. Check the connection and try again.
        </Text>
      ) : null}
      {older.more === false ? (
        <Text style={[styles.olderText, { color: c.ink3 }]}>{older.count > 0 ? "That is everything." : filtering ? "Nothing older matches." : "Nothing older."}</Text>
      ) : (
        <Button label={older.status === "loading" ? "Loading…" : "Show older"} disabled={older.status === "loading"} onPress={onLoad} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontFamily: font.medium, fontSize: 16, lineHeight: 22, marginHorizontal: 20, marginTop: -10, marginBottom: 6 },
  filters: { marginHorizontal: 16, marginTop: 6, gap: 8 },
  filterButton: { alignSelf: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingLeft: 12, minHeight: TARGET, maxWidth: "100%" },
  chipText: { flexShrink: 1, fontFamily: font.medium, fontSize: 14, fontVariant: ["tabular-nums"] },
  chipRemove: { width: TARGET, height: TARGET, alignItems: "center", justifyContent: "center" },
  book: { marginHorizontal: 22, marginTop: 12, marginBottom: 10 },
  emptyAction: { alignSelf: "flex-start", marginLeft: -12 },
  dayLine: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginHorizontal: 22, marginTop: -4, marginBottom: 8 },
  older: { marginHorizontal: 16, marginTop: 22, gap: 8, alignItems: "flex-start" },
  olderText: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginHorizontal: 6 },
  whole: { alignSelf: "flex-start", marginHorizontal: 10, marginTop: 14 },
});
