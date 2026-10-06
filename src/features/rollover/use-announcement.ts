"use client";
// The once-only lines the rollover leaves behind: Today's expired digest and
// Someday's auto-filed announcement (PRODUCT_SPEC.md §8.2 rule 5, §8.4 rule
// 4). Which batch was already told is kept on the settings row, so a
// dismissal holds on every device; no push, no sidebar count.
import { useCallback, useMemo } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { SettingsRepo } from "@/data/repositories/settings-repo";
import { unannounced } from "./unannounced";

export type AnnouncementKind = "expired" | "autoFiled";

const SEEN_SQL = `select id, expired_seen_at, auto_filed_seen_at from user_settings limit 1`;

/** `stamps` are the batch's timestamps (expired_at or auto_filed_at); `dismiss` records the newest as told. */
export function useAnnouncement(kind: AnnouncementKind, stamps: readonly (string | null)[]): { count: number; dismiss: () => void } {
  const db = useLocalDatabase();
  const { data } = useQuery<{ id: string; expired_seen_at: string | null; auto_filed_seen_at: string | null }>(SEEN_SQL);
  const row = data?.[0];
  const seen = kind === "expired" ? row?.expired_seen_at : row?.auto_filed_seen_at;
  const { count, newest } = useMemo(() => unannounced(stamps, seen), [stamps, seen]);
  const id = row?.id;
  const dismiss = useCallback(() => {
    if (!id || !newest) return;
    void new SettingsRepo(db).markAnnounced(id, kind, newest);
  }, [db, id, kind, newest]);
  // Until the settings row has synced there is nothing to compare with: say nothing rather than everything.
  return { count: row ? count : 0, dismiss };
}
