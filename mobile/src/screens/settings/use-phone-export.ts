// The export on the phone (PRODUCT_SPEC.md §19.1; the web's features/export/use-export.ts): the rows are gathered as
// the web gathers them (features/export/gather.ts: the device's rows, the finished week waited for, the older
// finished tasks fetched from the server with the session's token), the file is the one the web saves
// (export-file.ts), written to the app's own cache and handed to the system's share sheet, which saves it or sends
// it wherever the person chooses. Offline it still hands over what the phone has and says that finished tasks are
// missing, as the web does.
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useCallback, useState } from "react";
import type { ExportFormat } from "@/core/export";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { FINISHED_TASKS_OFFLINE } from "@/features/export/finished-wait";
import { gatherExport } from "@/features/export/gather";
import { fetchAllFinished } from "@/features/finished/finished";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { apiFetch } from "~/api";
import { exportFile, type ExportedFile } from "./export-file";

/** Said when the file could not be written or the share sheet would not open: the export itself is intact in the account. */
export const SHARE_FAILED = "Couldn’t hand the export to another app. Nothing was lost; try again.";

export interface PhoneExport {
  exportData: (format: ExportFormat) => Promise<void>;
  busy: ExportFormat | null;
  error: string | null;
  /** The last export handed over, for the "Prepared sparehour-export-….json" line. */
  lastFile: string | null;
}

const olderFromServer = () => fetchAllFinished(undefined, undefined, apiFetch);

/**
 * Writes the export as a real file and opens the share sheet on it. The file sits in the app's cache under its own
 * name, replacing the last export of that name; Android clears the cache when it needs the room.
 */
export async function handOver(file: ExportedFile): Promise<void> {
  const target = new File(Paths.cache, file.name);
  target.create({ overwrite: true });
  await target.write(file.content);
  await Sharing.shareAsync(target.uri, { mimeType: file.type, dialogTitle: file.name });
}

export function usePhoneExport(hand: (file: ExportedFile) => Promise<void> = handOver): PhoneExport {
  const db = useLocalDatabase() as LocalDatabase;
  const now = useNow();
  const { today } = useLocalDay(now);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const exportData = useCallback(
    async (format: ExportFormat) => {
      setBusy(format);
      setError(null);
      try {
        const { snapshot, complete } = await gatherExport(db, today, olderFromServer);
        const file = exportFile(format, snapshot, new Date(), { finishedTasks: complete });
        try {
          await hand(file);
        } catch {
          setError(SHARE_FAILED);
          return;
        }
        setLastFile(file.name);
        if (!complete) setError(FINISHED_TASKS_OFFLINE);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [db, today, hand],
  );
  return { exportData, busy, error, lastFile };
}
