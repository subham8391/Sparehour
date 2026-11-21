// Settings › Data on the phone (SCREENS.md §18, PRODUCT_SPEC.md §19.1, §6, §8.5; the web's
// sections/data-section.tsx and features/archive/archive-panel.tsx): Export everything, made on this phone as a real
// file per format and handed to the system's share sheet; Clear the slate, which opens its own screen (/slate); the
// Archive with a restore per batch, each named by date and count; and Delete permanently, the only hard delete there
// is, naming the count behind the typed confirmation. Restores are undoable (the repository records it); a permanent
// delete is final, on the web as here, so nothing offers to take it back. The batches, the counts and every sentence
// are the web's own (features/archive/batches.ts, confirm-words.ts, features/settings/section-words.ts).
// Presentational: the export, the restore and the delete are handed in.
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "~/ui/text";
import type { ExportFormat } from "@/core/export";
import type { LocalDate } from "@/core/time";
import {
  ARCHIVE,
  EVERY_ARCHIVED,
  EVERY_DROPPED,
  SHOWN_TITLES,
  archivedCount,
  batchLabel,
  batchWhat,
  deleteLabel,
  deleteSays,
  deleteTitle,
  deletedNotice,
  droppedCount,
  moreTitles,
  restoredNotice,
  type ArchiveBatch,
} from "@/features/archive/batches";
import { EXPORT_FORMATS, EXPORT_HINT, EXPORT_NOTE } from "@/features/settings/section-words";
import { Button } from "~/ui/button";
import { CardRow } from "~/ui/card";
import { Icon } from "~/ui/icon";
import { TARGET, font, useColours } from "~/ui/theme";
import { Group, Line, QuietRow, SettingRow, TypedConfirmSheet, Words } from "./parts";

export interface ExportPanel {
  busy: ExportFormat | null;
  error: string | null;
  /** The last export handed over, to say so. */
  lastFile: string | null;
  onExport: (format: ExportFormat) => void;
}

export interface DataViewProps {
  exporter: ExportPanel;
  /** Archived tasks by batch, newest first (`groupBatches`). */
  batches: readonly ArchiveBatch[];
  /** The person's today, for the batches' dates. */
  today: LocalDate;
  archivedIds: readonly string[];
  droppedIds: readonly string[];
  /** Opens Clear the slate, a screen of its own. */
  onClearSlate: () => void;
  /** Brings a batch back; resolves how many tasks came. */
  onRestore: (batch: ArchiveBatch) => Promise<number>;
  /** Asks the server to delete these for good; resolves how many went, or throws a sentence to show. */
  onDeletePermanently: (ids: readonly string[]) => Promise<number>;
}

interface Doomed {
  /** "the batch archived Tue 6 Oct", "every dropped task". */
  what: string;
  ids: readonly string[];
}

export function DataView({ exporter, batches, today, archivedIds, droppedIds, onClearSlate, onRestore, onDeletePermanently }: DataViewProps) {
  const c = useColours();
  const [doomed, setDoomed] = useState<Doomed | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [opened, setOpened] = useState<readonly string[]>([]);

  const restore = async (batch: ArchiveBatch) => {
    setRestoring(batch.key ?? "");
    try {
      setNotice(restoredNotice(await onRestore(batch)));
    } finally {
      setRestoring(null);
    }
  };
  const confirmDelete = async (): Promise<string | null> => {
    if (!doomed) return null;
    try {
      const n = await onDeletePermanently(doomed.ids);
      setNotice(deletedNotice(n, doomed.ids.length));
      setDoomed(null);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : ARCHIVE.failed;
    }
  };

  return (
    <>
      <Group>
        <CardRow first>
          <SettingRow label="Export everything" hint={EXPORT_HINT}>
            <View style={styles.buttons}>
              {EXPORT_FORMATS.map(([format, label]) => (
                <Button key={format} label={exporter.busy === format ? "Preparing…" : label} accessibilityLabel={`Export as ${label}`} disabled={exporter.busy !== null} onPress={() => exporter.onExport(format)} />
              ))}
            </View>
            <Line text={EXPORT_NOTE} flush />
            {exporter.lastFile ? <Line text={`Prepared ${exporter.lastFile}`} status flush /> : null}
            {exporter.error ? <Line text={exporter.error} tone="error" flush /> : null}
          </SettingRow>
        </CardRow>
      </Group>

      <Group title="Clear the slate">
        <CardRow first>
          <SettingRow label="Clear the slate" hint={ARCHIVE.slateHint}>
            <Button label="Clear the slate…" onPress={onClearSlate} style={styles.start} />
          </SettingRow>
        </CardRow>
      </Group>

      <Group title="Archive" note={ARCHIVE.note}>
        {batches.length === 0 ? (
          <CardRow first>
            <QuietRow text={ARCHIVE.none} />
          </CardRow>
        ) : (
          batches.map((b, i) => {
            const label = batchLabel(b, today);
            const key = b.key ?? "earlier";
            const open = opened.includes(key);
            return (
              <CardRow key={key} first={i === 0}>
                <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: open }} onPress={() => setOpened(open ? opened.filter((k) => k !== key) : [...opened, key])} style={styles.batch}>
                  <Icon name={open ? "chevron-down" : "chevron-right"} size={14} color={c.ink3} />
                  <Text style={[styles.batchLabel, { color: c.ink }]}>{label}</Text>
                </Pressable>
                {open ? (
                  <View style={styles.titles}>
                    {b.tasks.slice(0, SHOWN_TITLES).map((t) => (
                      <Text key={t.id} numberOfLines={2} style={[styles.title, { color: c.ink2 }]}>
                        {t.title}
                      </Text>
                    ))}
                    {b.tasks.length > SHOWN_TITLES ? <Text style={[styles.title, { color: c.ink3 }]}>{moreTitles(b.tasks.length - SHOWN_TITLES)}</Text> : null}
                  </View>
                ) : null}
                <View style={styles.batchActions}>
                  <Button label={restoring === (b.key ?? "") ? "Restoring…" : "Restore"} accessibilityLabel={`Restore ${label}`} disabled={restoring !== null} onPress={() => void restore(b)} />
                  <Button variant="quiet" destructive label="Delete" accessibilityLabel={`Delete ${label} permanently`} onPress={() => setDoomed({ what: batchWhat(label), ids: b.tasks.map((t) => t.id) })} />
                </View>
              </CardRow>
            );
          })
        )}
      </Group>

      <Group title="Delete permanently" note={ARCHIVE.deleteNote}>
        <CardRow first>
          <SettingRow label="Archived tasks" hint={archivedCount(archivedIds.length)} right={<Button destructive label="Delete…" accessibilityLabel="Delete archived tasks permanently" disabled={archivedIds.length === 0} onPress={() => setDoomed({ what: EVERY_ARCHIVED, ids: archivedIds })} />} />
        </CardRow>
        <CardRow>
          <SettingRow label="Dropped tasks" hint={droppedCount(droppedIds.length)} right={<Button destructive label="Delete…" accessibilityLabel="Delete dropped tasks permanently" disabled={droppedIds.length === 0} onPress={() => setDoomed({ what: EVERY_DROPPED, ids: droppedIds })} />} />
        </CardRow>
      </Group>

      {notice ? <Line text={notice} status /> : null}

      <TypedConfirmSheet open={doomed !== null} title={deleteTitle(doomed?.ids.length ?? 0)} confirmLabel={deleteLabel(doomed?.ids.length ?? 0)} busyLabel="Deleting…" onConfirm={confirmDelete} onClose={() => setDoomed(null)}>
        <Words text={deleteSays(doomed?.what ?? "", doomed?.ids.length ?? 0)} />
        <Words text={ARCHIVE.final} />
      </TypedConfirmSheet>
    </>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  start: { alignSelf: "flex-start" },
  batch: { minHeight: TARGET, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingTop: 4 },
  batchLabel: { flex: 1, fontFamily: font.medium, fontSize: 17, fontVariant: ["tabular-nums"] },
  titles: { paddingLeft: 36, paddingRight: 16, paddingBottom: 6, gap: 4 },
  title: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  batchActions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, paddingHorizontal: 16, paddingBottom: 10 },
});
