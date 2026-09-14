// The upload path (SYSTEM_DESIGN.md §4.2): validate the batch, strip the
// columns a client may never write, then hand everything to one Postgres
// function running as the user, so RLS is the enforcement boundary.
import { z } from "zod";

export const WireOp = z.object({
  client_id: z.union([z.string(), z.number()]).transform(String),
  op: z.enum(["PUT", "PATCH", "DELETE"]),
  table: z.string().regex(/^[a-z_]+$/),
  id: z.string().uuid(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const UploadBody = z.object({
  device_id: z.string().min(1).max(128),
  client_version: z.string().max(64).optional(),
  transaction_id: z.union([z.number(), z.string(), z.null()]).optional(),
  ops: z.array(WireOp).min(1).max(500),
});

export type WireOp = z.infer<typeof WireOp>;
export type UploadBody = z.infer<typeof UploadBody>;

/** Columns the server owns. A client value for any of these is dropped, never trusted. */
export const SERVER_OWNED_COLUMNS: Record<string, readonly string[]> = {
  tasks: ["carry_count", "last_carried_at", "last_touched_at", "assignee_id", "created_at", "updated_at"],
  time_blocks: ["external_event_id", "external_etag", "push_state", "created_at", "updated_at"],
  calendars: ["sync_token", "last_synced_at", "calendar_account_id", "external_id", "access_role", "created_at", "updated_at"],
  calendar_events: ["*"],
  user_settings: ["user_id", "space_id", "created_at", "updated_at"],
  spaces: ["owner_id", "kind", "created_at", "updated_at"],
  "*": ["created_at", "updated_at", "deleted_at"],
};

/** Returns the op with server-owned columns removed, or null when nothing is left to apply. */
export function sanitize(op: WireOp): WireOp | null {
  if (op.op === "DELETE" || !op.data) return op;
  const owned = new Set([...(SERVER_OWNED_COLUMNS[op.table] ?? []), ...SERVER_OWNED_COLUMNS["*"]]);
  if (owned.has("*")) return null;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(op.data)) if (!owned.has(k) && k !== "id") data[k] = v;
  if (op.op === "PATCH" && Object.keys(data).length === 0) return null;
  return { ...op, data };
}
