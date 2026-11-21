// One phone, one account's copy (DECISIONS.md, amendment 2026-11-21): the rows on the device are checked against the
// person signing in before anything syncs, with the web app's own rule (isForeign).
// The native database cannot load under Jest; the schema half of the kit is plain JavaScript and is the real one, so
// importing this file also builds the web app's own schema against the phone kit's version of it.
jest.mock("@powersync/react-native", () => ({ ...jest.requireActual("@powersync/common"), PowerSyncContext: {}, PowerSyncDatabase: class {} }));
jest.mock("expo-constants", () => ({ expoConfig: { version: "1.0.0" } }));
jest.mock("~/auth/supabase", () => ({ accessToken: jest.fn(async () => "token"), supabase: jest.fn(() => ({ auth: { signOut: jest.fn(async () => ({})) } })) }));

import { BUILD, connectFor, signOut } from "./database";

const local = (owners: string[]) => {
  const order: string[] = [];
  return {
    order,
    getAll: jest.fn(async () => owners.map((id) => ({ id }))),
    disconnectAndClear: jest.fn(async () => void order.push("clear")),
    connect: jest.fn(async () => void order.push("connect")),
  };
};

describe("connectFor", () => {
  it("connects straight away for the account whose copy is on the phone, or a phone with none", async () => {
    for (const owners of [["u1"], []]) {
      const db = local(owners);
      await connectFor("u1", db as never);
      expect(db.disconnectAndClear).not.toHaveBeenCalled();
      expect(db.connect).toHaveBeenCalledTimes(1);
    }
  });

  it("clears another account's copy before it connects", async () => {
    const db = local(["u2"]);
    await connectFor("u1", db as never);
    expect(db.order).toEqual(["clear", "connect"]);
  });

  it("does not connect when the copy could not be cleared: someone else's rows are never synced into", async () => {
    const db = local(["u2"]);
    db.disconnectAndClear.mockRejectedValueOnce(new Error("locked"));
    await expect(connectFor("u1", db as never)).rejects.toThrow("locked");
    expect(db.connect).not.toHaveBeenCalled();
  });

  it("a connection that fails to start does not hold the screens back: sync retries by itself", async () => {
    const db = local(["u1"]);
    db.connect.mockRejectedValueOnce(new Error("offline"));
    await expect(connectFor("u1", db as never)).resolves.toBeUndefined();
  });
});

describe("signOut", () => {
  it("removes the account's data from the phone before the session ends", async () => {
    const db = local(["u1"]);
    await signOut(db as never);
    expect(db.disconnectAndClear).toHaveBeenCalledTimes(1);
  });
});

it("names its build to the server", () => {
  expect(BUILD).toBe("android-1.0.0");
});

it("the web app's schema is valid for the phone's sync kit, table for table", () => {
  const { AppSchema } = jest.requireActual("@/data/schema.client") as { AppSchema: { tables: { name: string }[]; validate: () => void } };
  expect(() => AppSchema.validate()).not.toThrow();
  expect(AppSchema.tables.map((t) => t.name)).toEqual(expect.arrayContaining(["users", "user_settings", "tasks", "time_blocks", "work_hours", "calendar_events"]));
});
