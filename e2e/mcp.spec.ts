// Claude connects to Sparehour (DECISIONS.md, amendment 2026-10-23), the whole way an MCP client goes: the 401 names
// the protected-resource document, that names Supabase Auth, the client registers itself and sends the person to
// the consent screen, Allow returns a code, the code becomes the person's token. With it the tools add a task from
// quick-add words (it reaches the app through sync), move it, complete it, and make a list with items; then Settings
// › Connected apps makes the connection read only (writes are refused, reads still answer) and Disconnect stops the
// token. Every row here starts with "E2E ", so afterAll and the teardown remove them.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { devAccount, isoPlus, withDb } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `m${Date.now().toString(36)}`;
const CLIENT = `${E2E_PREFIX}Claude ${n}`;
const REDIRECT = "http://127.0.0.1:47823/callback";
const title = `${E2E_PREFIX}Draft proposal ${n}`;
const listName = `${E2E_PREFIX}Books ${n}`;
const tag = `e2e-${n}`;

// The client's own callback, as Claude Code listens on localhost: a browser follows the consent's 303 straight to it.
let callback: Server | null = null;
const arrived: string[] = [];
test.beforeAll(async () => {
  callback = createServer((req, res) => {
    arrived.push(`http://127.0.0.1:47823${req.url}`);
    res.writeHead(200, { "content-type": "text/html" }).end("<p>back in the app</p>");
  });
  await new Promise<void>((resolve) => callback?.listen(47823, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  callback?.close();
  await withDb(async (c) => {
    await c.query("delete from public.task_tags where task_id in (select id from public.tasks where title like $1)", [`%${n}`]);
    await c.query("delete from public.tasks where title like $1", [`%${n}`]);
    await c.query("delete from public.list_items where title like $1", [`%${n}`]);
    await c.query("delete from public.lists where name like $1", [`%${n}`]);
    await c.query("delete from public.tags where name = $1", [tag]);
    await c.query("delete from public.app_connections where client_name = $1", [CLIENT]);
    await c.query("delete from auth.oauth_clients where client_name = $1", [CLIENT]);
  });
});

const b64url = (b: Buffer) => b.toString("base64url");

/** One JSON-RPC call to the endpoint, read from JSON or from an SSE frame. */
async function rpc(request: APIRequestContext, token: string | null, method: string, params: Record<string, unknown> = {}) {
  const res = await request.post("/api/mcp", {
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    data: { jsonrpc: "2.0", id: Math.floor(Math.random() * 1e6), method, params },
  });
  const text = await res.text();
  const json = (res.headers()["content-type"] ?? "").includes("text/event-stream") ? JSON.parse(text.split("\n").find((l) => l.startsWith("data: "))?.slice(6) ?? "null") : text ? JSON.parse(text) : null;
  return { status: res.status(), headers: res.headers(), json };
}

async function call(request: APIRequestContext, token: string, name: string, args: Record<string, unknown> = {}) {
  const r = await rpc(request, token, "tools/call", { name, arguments: args });
  expect(r.status, JSON.stringify(r.json)).toBe(200);
  return { text: String(r.json.result.content[0].text), isError: Boolean(r.json.result.isError) };
}

const idIn = (text: string) => /\[id ([0-9a-f-]{36})\]/.exec(text)?.[1] ?? null;

test("Claude connects through the consent screen and works the planner over MCP", async ({ page, request }) => {
  test.setTimeout(180_000);
  const me = await withDb((c) => devAccount(c, DEV_USER.email));

  // 1. Discovery: the 401's challenge → the protected-resource document → the authorization server's metadata.
  const challenge = await rpc(request, null, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } });
  expect(challenge.status).toBe(401);
  const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge.headers["www-authenticate"] ?? "")?.[1];
  expect(metadataUrl).toMatch(/\/\.well-known\/oauth-protected-resource\/api\/mcp$/);
  const prm = await (await request.get(metadataUrl as string)).json();
  expect(prm.resource).toMatch(/\/api\/mcp$/);
  const issuer = prm.authorization_servers[0] as string;
  const as = await (await request.get(`${issuer}/.well-known/openid-configuration`)).json();
  expect(as.registration_endpoint).toBeTruthy();

  // 2. The client registers itself (dynamic client registration) and starts PKCE.
  const reg = await (
    await request.post(as.registration_endpoint, {
      data: { client_name: CLIENT, redirect_uris: [REDIRECT], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" },
    })
  ).json();
  expect(reg.client_id, JSON.stringify(reg)).toBeTruthy();
  const verifier = b64url(randomBytes(32));
  const authorize = new URL(as.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: reg.client_id,
    redirect_uri: REDIRECT,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    state: n,
    resource: prm.resource,
  }))
    authorize.searchParams.set(k, v);

  // 3. The person (signed in already) sees the consent screen, keeps "Read and change", and allows.
  await page.goto(authorize.toString());
  await expect(page).toHaveURL(/\/oauth\/consent\?authorization_id=/);
  await expect(page.getByRole("heading", { name: `Connect ${CLIENT} to Sparehour` })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Read and change/ })).toBeChecked();
  await page.getByRole("button", { name: "Allow" }).click();
  await page.waitForURL((u) => u.toString().startsWith(REDIRECT));
  const back = new URL(page.url());
  expect(back.searchParams.get("state")).toBe(n);
  const code = back.searchParams.get("code");
  expect(code).toBeTruthy();

  // 4. The code becomes the person's token.
  const tokens = await (await request.post(as.token_endpoint, { form: { grant_type: "authorization_code", code: code as string, redirect_uri: REDIRECT, client_id: reg.client_id, code_verifier: verifier } })).json();
  expect(tokens.access_token, JSON.stringify(tokens)).toBeTruthy();
  const token = tokens.access_token as string;

  // 5. The MCP handshake and the tools.
  const init = await rpc(request, token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0" } });
  expect(init.status).toBe(200);
  expect(init.json.result.serverInfo.name).toBe("sparehour");
  const tools = await rpc(request, token, "tools/list");
  expect(tools.json.result.tools.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(["get_today", "get_inbox", "get_upcoming", "search", "add_task", "complete_task", "reschedule_task", "create_list", "add_list_items"]));

  // add_task reads quick-add as the app does: a Friday at 15:00, 45 minutes, a new tag; written as the person, by MCP.
  const added = await call(request, token, "add_task", { text: `${title} fri 3pm ~45m @${tag}` });
  expect(added.isError, added.text).toBe(false);
  expect(added.text).toContain(`Added “${title}”`);
  const taskId = idIn(added.text) as string;
  const row = await withDb(async (c) =>
    (
      await c.query(
        `select t.source, t.state, t.do_time::text, t.estimate_min, extract(isodow from t.do_date)::int as dow, t.space_id = $2 as mine,
                (select count(*) from public.task_tags tt join public.tags g on g.id = tt.tag_id where tt.task_id = t.id and g.name = $3)::int as tagged
           from public.tasks t where t.id = $1`,
        [taskId, me.sid, tag],
      )
    ).rows[0],
  );
  expect(row).toEqual({ source: "mcp", state: "active", do_time: "15:00:00", estimate_min: 45, dow: 5, mine: true, tagged: 1 });

  // It reaches the app through the sync streams like any other write.
  await openApp(page, `/search?q=${encodeURIComponent(title)}`);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });

  // Reads answer: today, upcoming and search.
  const today = await call(request, token, "get_today");
  expect(today.isError).toBe(false);
  expect(today.text).toMatch(/^Today, /);
  expect((await call(request, token, "search", { query: `proposal ${n}` })).text).toContain(title);

  // Move it to tomorrow, then complete it.
  const moved = await call(request, token, "reschedule_task", { task: taskId, when: "tomorrow" });
  expect(moved.text).toContain("Moved");
  expect((await withDb((c) => c.query("select do_date::text from public.tasks where id = $1", [taskId]))).rows[0].do_date).toBe(isoPlus(me.today, 1));
  expect((await call(request, token, "complete_task", { task: title })).text).toBe(`Completed “${title}”`);
  expect((await withDb((c) => c.query("select state from public.tasks where id = $1", [taskId]))).rows[0].state).toBe("done");

  // A list with items: a rating, a status and a tag on one, a plain title for the other.
  const made = await call(request, token, "create_list", { name: listName, emoji: "📚" });
  const listId = idIn(made.text) as string;
  expect(listId).toBeTruthy();
  const items = await call(request, token, "add_list_items", { list: listName, items: [{ title: `${E2E_PREFIX}Dune ${n}`, status: "doing", rating: 5, tags: [tag] }, `${E2E_PREFIX}Neuromancer ${n}`] });
  expect(items.text).toContain("Added 2 items");
  expect((await call(request, token, "update_list_item", { item: `${E2E_PREFIX}Dune ${n}`, status: "done" })).text).toContain("marked done");
  const list = await call(request, token, "get_list", { list: listId });
  expect(list.text).toContain(`${E2E_PREFIX}Neuromancer ${n} — to do`);
  expect(list.text).toContain(`${E2E_PREFIX}Dune ${n} — done · 5★ · @${tag}`);
  await openApp(page, `/list/${listId}`);
  await expect(page.getByText(`${E2E_PREFIX}Neuromancer ${n}`)).toBeVisible({ timeout: 30_000 });

  // Settings › Connected apps: read only. Writes are refused with the way back; reads still answer.
  await openApp(page, "/settings#connections");
  const appRow = page.getByRole("group", { name: CLIENT });
  await expect(appRow).toBeVisible();
  await appRow.getByRole("radiogroup", { name: `What ${CLIENT} may do` }).getByRole("radio", { name: "Read only" }).click();
  await expect.poll(async () => (await withDb((c) => c.query("select access from public.app_connections where client_id = $1", [reg.client_id]))).rows[0]?.access).toBe("read");
  const refused = await call(request, token, "add_task", { text: `${E2E_PREFIX}Refused ${n}` });
  expect(refused.isError).toBe(true);
  expect(refused.text).toContain("read only");
  expect((await call(request, token, "get_inbox")).isError).toBe(false);

  // Disconnect: the token stops working at once.
  await appRow.getByRole("button", { name: "Disconnect" }).click();
  await expect(appRow).toHaveCount(0);
  expect((await rpc(request, token, "tools/list")).status).toBe(401);
});
