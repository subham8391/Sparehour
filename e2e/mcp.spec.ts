// Claude connects to Sparehour (DECISIONS.md, amendment 2026-10-23), the whole way an MCP client goes: the 401 names
// the protected-resource document, that names Supabase Auth, the client registers itself and sends the person to
// the consent screen, Allow returns a code, the code becomes the person's token. With it the tools add a task from
// quick-add words (it reaches the app through sync), show Plan my day and put it on the timeline (DECISIONS.md,
// amendment 2026-11-14), move the task and complete it; then Settings
// › Connected apps makes the connection read only (writes are refused, reads still answer) and Disconnect stops the
// token. Every row here starts with "E2E ", so afterAll and the teardown remove them.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addAllDayHours, devAccount, isoPlus, putBack, seedKey, standAside, withDb, type StoodAside } from "./db";
import { DEV_USER, E2E_PREFIX, openApp } from "./helpers";

const n = `m${Date.now().toString(36)}`;
const CLIENT = `${E2E_PREFIX}Claude ${n}`;
const REDIRECT = "http://127.0.0.1:47823/callback";
const title = `${E2E_PREFIX}Draft proposal ${n}`;
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
    await c.query("delete from public.time_blocks where title like $1", [`%${n}`]);
    // The project, its copy, and the one a task was made into, with the tasks made from steps in them.
    const made = (await c.query("select id from public.projects where name like $1", [`%${n}%`])).rows.map((r) => r.id);
    await c.query("delete from public.tasks where project_id = any($1::uuid[])", [made]);
    await c.query("delete from public.headings where project_id = any($1::uuid[])", [made]);
    await c.query("delete from public.projects where id = any($1::uuid[])", [made]);
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
  const names: string[] = tools.json.result.tools.map((t: { name: string }) => t.name);
  expect(names).toEqual(expect.arrayContaining(["get_today", "get_inbox", "get_upcoming", "search", "add_task", "complete_task", "reschedule_task", "plan_day", "apply_day_plan", "draft_task", "block_time", "add_project"]));
  // Lists were taken out of the app (DECISIONS.md, amendment 2026-11-14): Claude is offered no list tool.
  expect(names.filter((name) => /list_item|_lists?$/.test(name))).toEqual([]);

  // Adding asks first (DECISIONS.md, amendment 2026-11-22): the draft says what is not set with the person's choices,
  // and add_task without the person's answer writes nothing.
  const asked = await call(request, token, "add_task", { tasks: [{ text: `${title} fri 3pm ~45m` }] });
  expect(asked.text).toMatch(/^Nothing has been added: ask the person first/);
  expect(asked.text).toContain("Not set: project, deadline, priority, tags");
  expect(asked.text).toContain("Which project?");
  expect((await withDb((c) => c.query("select 1 from public.tasks where title = $1", [title]))).rowCount).toBe(0);

  const unasked = await call(request, token, "add_task", { tasks: [{ text: `${title} fri 3pm ~45m` }], confirmed: true });
  expect(unasked.text).toContain("This was not added: it has not been drafted yet");
  // Answered, it reads quick-add as the app does: a Friday at 15:00, 45 minutes, a new tag; written as the person, by MCP.
  const added = await call(request, token, "add_task", { tasks: [{ text: `${title} fri 3pm ~45m`, tags: [tag], steps: ["One", "Two"], draft: /Draft code: ([0-9a-f]{6})/.exec(asked.text)?.[1] }], confirmed: true });
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

  // With its steps, and its time on the timeline (unless that Friday's 15:00 is already behind).
  const made = await withDb(async (c) => ({
    steps: (await c.query("select title from public.checklist_items where task_id = $1 and deleted_at is null order by sort_key", [taskId])).rows.map((r) => r.title),
    blocks: (await c.query("select source, locked, user_id = $2 as mine, (extract(epoch from end_at - start_at) / 60)::int as minutes from public.time_blocks where task_id = $1 and deleted_at is null", [taskId, me.uid])).rows,
  }));
  expect(made.steps).toEqual(["One", "Two"]);
  if (added.text.includes("· blocked")) expect(made.blocks).toEqual([{ source: "manual", locked: false, mine: true, minutes: 45 }]);

  // The rest of the app, against the real database as this person: steps, a block, a project with a heading, settings.
  expect((await call(request, token, "edit_steps", { task: taskId, check: ["One"], add: ["Three"] })).text).toContain("ticked “One”, added “Three”");
  const project = await call(request, token, "add_project", { name: `${E2E_PREFIX}Project ${n}`, headings: ["Plan"] });
  expect(project.isError, project.text).toBe(false);
  const projectId = idIn(project.text) as string;
  expect((await call(request, token, "update_task", { task: taskId, project: projectId, heading: "Plan" })).text).toContain("under Plan");
  expect((await call(request, token, "get_project", { project: projectId })).text).toContain(`Plan (heading, 1)\n- ${title}`);
  const ad = await call(request, token, "block_time", { title: `${E2E_PREFIX}Block ${n}`, day: isoPlus(me.today, 2), start: "11:00", minutes: 45 });
  const blockId = /\[block ([0-9a-f-]{36})\]/.exec(ad.text)?.[1] as string;
  expect((await call(request, token, "change_block", { block: blockId, start: "12:00", locked: true })).text).toContain("12:00–12:45");
  expect((await call(request, token, "get_day", { day: isoPlus(me.today, 2) })).text).toContain(`12:00–12:45 ${E2E_PREFIX}Block ${n} · locked`);
  expect((await call(request, token, "remove_block", { block: blockId })).isError).toBe(false);
  for (const [name, args] of [["get_settings", {}], ["list_tags", {}], ["get_someday", {}], ["get_logbook", { days: 7 }], ["search", { tag }]] as const) {
    const r = await call(request, token, name, args);
    expect(r.isError, `${name}: ${r.text}`).toBe(false);
    // Quiet hours are part of what an assistant reads (REMINDERS_AND_AI_SPEC.md §2).
    if (name === "get_settings") expect(r.text).toMatch(/Quiet hours: (none|\d\d:\d\d–\d\d:\d\d \(no reminders are sent then\))/);
  }
  const repeat = await call(request, token, "change_repeat", { task: taskId, action: "set", repeat: "every friday" });
  expect(repeat.text).toContain("now repeats every Friday");
  expect((await call(request, token, "change_repeat", { task: taskId, action: "skip" })).text).toContain("Skipped");
  expect((await call(request, token, "change_repeat", { task: taskId, action: "stop" })).text).toContain("no longer repeats");
  const copy = await call(request, token, "duplicate_project", { project: projectId });
  expect(copy.text).toContain("with 1 open task");
  expect((await call(request, token, "make_task_a_project", { task: idIn((await call(request, token, "duplicate_task", { task: taskId })).text) as string })).text).toContain("3 tasks from its steps");

  // It reaches the app through the sync streams like any other write.
  await openApp(page, `/search?q=${encodeURIComponent(title)}`);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });

  // Reads answer: today, upcoming and search.
  const today = await call(request, token, "get_today");
  expect(today.isError).toBe(false);
  expect(today.text).toMatch(/^Today, /);
  expect((await call(request, token, "search", { query: `proposal ${n}` })).text).toContain(title);

  // Plan my day, the app's own scheduler: shown first with nothing written, then put on the timeline as the plan's
  // own block. Every hour is a working hour and the account's other open tasks stand aside for these few calls, so
  // the plan holds this spec's task whatever the day or the seed. Before the day rolls over the app's today has
  // already ended, and in its last half hour nothing fits: then only the reading is checked.
  const planTitle = `${E2E_PREFIX}Plan me ${n}`;
  const room = me.minute >= me.rollover * 60 && me.minute < 23 * 60;
  let hours: string[] = [];
  let aside: StoodAside[] = [];
  let planTaskId = "";
  await withDb(async (c) => {
    hours = await addAllDayHours(c, me);
    aside = await standAside(c, me);
    planTaskId = (
      await c.query<{ id: string }>(
        "insert into public.tasks (id, space_id, title, state, priority, do_date, estimate_min, sort_key) values (gen_random_uuid(), $1, $2, 'active', 3, $3::date, 30, $4) returning id",
        [me.sid, planTitle, me.today, seedKey("97")],
      )
    ).rows[0].id;
  });
  try {
    const shown = await call(request, token, "plan_day");
    expect(shown.isError, shown.text).toBe(false);
    expect(shown.text).toMatch(/^Plan for today, /);
    expect(shown.text).toContain(planTitle);
    const blocksOf = async () =>
      (
        await withDb((c) =>
          c.query("select source, locked, user_id = $2 as mine, (extract(epoch from end_at - start_at) / 60)::int as minutes from public.time_blocks where task_id = $1 and deleted_at is null", [planTaskId, me.uid]),
        )
      ).rows;
    expect(await blocksOf()).toEqual([]);
    if (room) {
      expect(shown.text).toContain("Blocks (1)");
      expect(shown.text).toContain("Nothing has changed yet.");
      const applied = await call(request, token, "apply_day_plan");
      expect(applied.isError, applied.text).toBe(false);
      expect(applied.text).toContain("On the timeline now (1)");
      // Written as the person, as the plan's own unlocked block, for the task's half hour.
      expect(await blocksOf()).toEqual([{ source: "plan", locked: false, mine: true, minutes: 30 }]);
    }
  } finally {
    await withDb(async (c) => {
      await c.query("delete from public.time_blocks where task_id = $1", [planTaskId]);
      await c.query("delete from public.work_hours where id = any($1::uuid[])", [hours]);
      await putBack(c, aside);
    });
  }

  // Move it to tomorrow, then complete it.
  const moved = await call(request, token, "reschedule_task", { task: taskId, when: "tomorrow" });
  expect(moved.text).toContain("Moved");
  expect((await withDb((c) => c.query("select do_date::text from public.tasks where id = $1", [taskId]))).rows[0].do_date).toBe(isoPlus(me.today, 1));
  expect((await call(request, token, "complete_task", { task: taskId })).text).toBe(`Completed “${title}”`);
  expect((await withDb((c) => c.query("select state from public.tasks where id = $1", [taskId]))).rows[0].state).toBe("done");

  // Settings › Connected apps: read only. Writes are refused with the way back; reads still answer.
  await openApp(page, "/settings#connections");
  const appRow = page.getByRole("group", { name: CLIENT });
  await expect(appRow).toBeVisible();
  await appRow.getByRole("radiogroup", { name: `What ${CLIENT} may do` }).getByRole("radio", { name: "Read only" }).click();
  await expect.poll(async () => (await withDb((c) => c.query("select access from public.app_connections where client_id = $1", [reg.client_id]))).rows[0]?.access).toBe("read");
  const refused = await call(request, token, "add_task", { tasks: [{ text: `${E2E_PREFIX}Refused ${n}` }], confirmed: true });
  expect(refused.isError).toBe(true);
  expect(refused.text).toContain("read only");
  expect((await call(request, token, "get_inbox")).isError).toBe(false);

  // Disconnect: the token stops working at once.
  await appRow.getByRole("button", { name: "Disconnect" }).click();
  await expect(appRow).toHaveCount(0);
  expect((await rpc(request, token, "tools/list")).status).toBe(401);
});
