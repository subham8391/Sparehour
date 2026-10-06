import { describe, expect, it } from "vitest";
import { localSqlite } from "@/test/local-sqlite";
import { SettingsRepo, WorkHoursRepo } from "./settings-repo";

const ctx = { spaceId: "s1", userId: "u1" };
function setup() {
  const db = localSqlite();
  const repo = new WorkHoursRepo(db.db);
  const live = (weekday: number) =>
    db.rows("select id, start_time, end_time from work_hours where deleted_at is null and weekday = ? order by start_time", [weekday]) as { id: string; start_time: string; end_time: string }[];
  return { ...db, repo, live };
}

describe("WorkHoursRepo.replaceDay", () => {
  it("splits a day in one transaction, reusing the existing row and adding the second", async () => {
    const { repo, live, outside } = setup();
    await repo.replaceDay(0, [{ start: "09:00", end: "18:00" }], ctx);
    const [first] = live(0);
    outside.length = 0;
    await repo.replaceDay(
      0,
      [
        { start: "13:30", end: "18:00" },
        { start: "09:00", end: "12:30" },
      ],
      ctx,
    );
    expect(outside).toEqual([]);
    const rows = live(0);
    expect(rows.map((r) => [r.start_time, r.end_time])).toEqual([
      ["09:00", "12:30"],
      ["13:30", "18:00"],
    ]);
    expect(rows[0].id).toBe(first.id);
  });

  it("removes the extra stretches by id, and an empty list is a day off", async () => {
    const { repo, live, rows } = setup();
    await repo.replaceDay(
      2,
      [
        { start: "09:00", end: "12:30" },
        { start: "13:30", end: "18:00" },
      ],
      ctx,
    );
    const [, second] = live(2);
    await repo.replaceDay(2, [{ start: "09:00", end: "18:00" }], ctx);
    expect(live(2).map((r) => [r.start_time, r.end_time])).toEqual([["09:00", "18:00"]]);
    expect(rows("select deleted_at from work_hours where id = ?", [second.id])[0].deleted_at).not.toBeNull();
    await repo.replaceDay(2, [], ctx);
    expect(live(2)).toEqual([]);
  });

  it("undo is the same call with the day's previous stretches: the whole day comes back", async () => {
    const { repo, live } = setup();
    const before = [
      { start: "09:00", end: "12:30" },
      { start: "13:30", end: "18:00" },
    ];
    await repo.replaceDay(4, before, ctx);
    await repo.replaceDay(4, [], ctx);
    await repo.replaceDay(4, before, ctx);
    expect(live(4).map((r) => ({ start: r.start_time, end: r.end_time }))).toEqual(before);
  });

  it("leaves other weekdays alone", async () => {
    const { repo, live } = setup();
    await repo.replaceDay(0, [{ start: "09:00", end: "18:00" }], ctx);
    await repo.replaceDay(1, [{ start: "10:00", end: "16:00" }], ctx);
    await repo.replaceDay(0, [], ctx);
    expect(live(1).map((r) => r.start_time)).toEqual(["10:00"]);
  });
});

describe("SettingsRepo.update", () => {
  it("writes the planning and notification columns by name, booleans as 0/1", async () => {
    const { db } = localSqlite();
    const statements: unknown[][] = [];
    const repo = new SettingsRepo({ ...db, execute: async (sql: string, args: unknown[]) => void statements.push([sql, args]) } as unknown as typeof db);
    await repo.update("row1", { defaultMissPolicy: "expire", defaultView: "inbox", blockStartLeadMin: 10, badgeEnabled: false });
    expect(String(statements[0][0])).toBe("update user_settings set default_miss_policy = ?, default_view = ?, block_start_lead_min = ?, badge_enabled = ?, updated_at = ? where id = ?");
    expect((statements[0][1] as unknown[]).slice(0, 4)).toEqual(["expire", "inbox", 10, 0]);
  });
});
