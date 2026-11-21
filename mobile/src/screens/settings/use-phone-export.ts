// The export on the phone (PRODUCT_SPEC.md §19.1; the web's features/export/use-export.ts): the rows are gathered as
// the web gathers them (features/export/gather.ts: the device's rows, the finished week waited for, the older
// finished tasks fetched from the server with the session's token), the text is built by the web's own builders
// (export-text.ts), and the system's share sheet takes it. Offline it still hands over what the phone has and says
// that finished tasks are missing, as the web does.
import { useCallback, useState } from "react";
import { Share } from "react-native";
import type { ExportFormat } from "@/core/export";
import { useLocalDatabase, type LocalDatabase } from "@/data/powersync";
import { FINISHED_TASKS_OFFLINE } from "@/features/export/finished-wait";
import { gatherExport } from "@/features/export/gather";
import { fetchAllFinished } from "@/features/finished/finished";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { apiFetch } from "~/api";
import { exportText } from "./export-text";

/** Said when the share sheet would not take the export: a very large account's export can be more than Android passes between apps. */
export const SHARE_FAILED = "Couldn’t hand the export to another app. Nothing was lost; a very large export may be more than a phone can share as text.";

export interface PhoneExport {
  exportData: (format: ExportFormat) => Promise<void>;
  busy: ExportFormat | null;
  error: string | null;
  /** The last export handed over, for the "Prepared sparehour-export-….json" line. */
  lastFile: string | null;
}

const olderFromServer = () => fetchAllFinished(undefined, undefined, apiFetch);

export function usePhoneExport(): PhoneExport {
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
        const { name, text } = exportText(format, snapshot, new Date(), { finishedTasks: complete });
        try {
          await Share.share({ title: name, message: text });
        } catch {
          setError(SHARE_FAILED);
          return;
        }
        setLastFile(name);
        if (!complete) setError(FINISHED_TASKS_OFFLINE);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [db, today],
  );
  return { exportData, busy, error, lastFile };
}
