// Writes that only follow the rollover job (Someday's auto-filed group, the once-only
// announcements), kept out of TaskRepo and SettingsRepo so the app shells do not carry them.
import type { LocalDatabase } from "../powersync";
import { placeholders } from "./undo";

export class SomedayRepo {
  constructor(private readonly db: LocalDatabase) {}

  /**
   * "Keep in Someday" in the Review walk: the person has looked and the task stays parked, so the
   * rollover's stamp is cleared and the task joins its project's group. The stamp is server-owned and may
   * only be cleared (tasks_guard; CLEARABLE_COLUMNS in src/server/sync/upload.ts), so there is nothing an undo could put back,
   * and nothing else changes.
   */
  async keep(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.execute(`update tasks set auto_filed_at = null, updated_at = ? where id in (${placeholders(ids)}) and state = 'someday'`, [new Date().toISOString(), ...ids]);
  }
}

/**
 * Records the newest rollover batch a once-only line has told the person about: Today's expired digest
 * (`expired`) or Someday's auto-filed line (`autoFiled`), on the settings row so it holds on every device.
 * Not a setting and not undoable; see features/rollover/use-announcement.
 */
export async function markAnnounced(db: LocalDatabase, settingsId: string, kind: "expired" | "autoFiled", newest: string): Promise<void> {
  const column = kind === "expired" ? "expired_seen_at" : "auto_filed_seen_at";
  await db.execute(`update user_settings set ${column} = ?, updated_at = ? where id = ?`, [newest, new Date().toISOString(), settingsId]);
}
