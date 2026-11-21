// Clear the slate on the phone (PRODUCT_SPEC.md §8.5), at /slate: the web's sheet as a screen of its own, opened from
// Today's ⋯, the Carried over header and Settings › Data, as the web's is. Wired to the phone's
// own database with the web app's own code: the two counts (data/queries/archive.ts) and the one write
// (data/repositories/archive.ts), which archives every task in the scope under one new batch and records the one
// undo the app's toast offers: "Slate cleared. 47 tasks archived", Undo. The batch can be brought back any time
// later from Settings › Data › Archive. The drawing is slate-view.tsx.
import { useRouter } from "expo-router";
import { useLocalDatabase, useQuery, type LocalDatabase } from "@/data/powersync";
import { SLATE_COUNTS_SQL, slateCountArgs } from "@/data/queries/archive";
import { clearTheSlate } from "@/data/repositories/archive";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { useUndoSink } from "@/features/undo/undo-context";
import { SlateView } from "./slate-view";

export function Slate() {
  const router = useRouter();
  const db = useLocalDatabase() as LocalDatabase;
  const undo = useUndoSink();
  const now = useNow();
  // The person's own day (their time zone and rollover hour): until the settings are in, nothing is counted.
  const { today, settings } = useLocalDay(now);
  const todayIso = today.toString();
  const { data } = useQuery<{ today: number; backlog: number }>(SLATE_COUNTS_SQL, slateCountArgs(todayIso));
  return (
    <SlateView
      counts={settings ? data?.[0] : undefined}
      onConfirm={(scope) => clearTheSlate(db, undo ?? undefined, scope, todayIso)}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}
