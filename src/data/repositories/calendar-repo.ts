// What a person may change about a calendar (PRODUCT_SPEC.md §10.1): whether
// it counts as busy, whether its titles show, and which one calendar takes
// the blocks. Everything else on the row is the server's.
import type { LocalDatabase } from "../powersync";

export class CalendarRepo {
  constructor(private readonly db: LocalDatabase) {}

  setRead(id: string, read: boolean): Promise<void> {
    return this.db.execute(`update calendars set read = ? where id = ?`, [read ? 1 : 0, id]).then(() => undefined);
  }

  setPrivate(id: string, isPrivate: boolean): Promise<void> {
    return this.db.execute(`update calendars set private = ? where id = ?`, [isPrivate ? 1 : 0, id]).then(() => undefined);
  }

  /** Exactly one calendar writes (§6.7): the others are cleared first, in the same transaction. */
  setWriteTarget(id: string | null): Promise<void> {
    return this.db.writeTransaction(async (tx) => {
      await tx.execute(`update calendars set write_target = 0 where write_target = 1 and (? is null or id <> ?)`, [id, id]);
      if (id) await tx.execute(`update calendars set write_target = 1 where id = ?`, [id]);
    });
  }
}
