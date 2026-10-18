#!/usr/bin/env node
// A hosted environment's secrets (docs/engineering/DEPLOY.md). Run it once per environment, dev and prod, and never
// carry a value from one to the other. It prints three things: the Vercel variables (paste them into the project's
// Environment Variables, scoped to that environment), the PowerSync client-auth settings, and the SQL to run in that
// Supabase project once the migrations are in. Nothing is written unless `--out` names a file, which must be outside
// the repo or a git-ignored `.env*` file. Everything it prints is a secret: keep it out of chat, issues and commits.
//
//   node scripts/new-env.mjs --name dev --url https://sparehour-dev.vercel.app --contact you@example.com
//
// The values that come from the dashboards can be passed too, so the Vercel block is complete:
//   --supabase-url https://<ref>.supabase.co  --anon-key …  --service-role-key …  --powersync-url https://<id>.powersync.journeyapps.com
import { randomBytes as nodeRandomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import webpush from "web-push";

/** The sync token's key id and audience: the values src/server/sync/token.ts signs with (its test holds them equal). */
export const SYNC_TOKEN_KID = "sparehour-sync-v1";
export const SYNC_TOKEN_AUDIENCE = "powersync";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Values a dashboard gives you, by the flag that carries them. */
const FROM_DASHBOARDS = [
  { flag: "supabase-url", key: "NEXT_PUBLIC_SUPABASE_URL", where: "Supabase → Project Settings → Data API → Project URL" },
  { flag: "anon-key", key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", where: "Supabase → Project Settings → API Keys → anon (public)" },
  { flag: "service-role-key", key: "SUPABASE_SERVICE_ROLE_KEY", where: "Supabase → Project Settings → API Keys → service_role (secret)" },
  { flag: "powersync-url", key: "NEXT_PUBLIC_POWERSYNC_URL", where: "PowerSync dashboard → the instance → Connect → instance URL" },
];

/** A literal for SQL: single quotes doubled. */
const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;

/**
 * Everything one environment needs, freshly made. `random(n)` returns n random bytes and `vapid()` a VAPID key pair;
 * both are injectable so a test can pin them.
 */
export function buildEnvironment(opts, { random = nodeRandomBytes, vapid = () => webpush.generateVAPIDKeys() } = {}) {
  const name = String(opts.name ?? "").trim();
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error("--name is the environment's short name, such as dev or prod");
  let url;
  try {
    url = new URL(String(opts.url ?? ""));
  } catch {
    throw new Error("--url is the environment's public address, such as https://sparehour-dev.vercel.app");
  }
  // Push needs a secure origin, and Google only calls webhooks on HTTPS.
  if (url.protocol !== "https:") throw new Error("--url must be https://");
  const appUrl = url.origin;
  const contact = String(opts.contact ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(contact)) throw new Error("--contact is an email address push services can reach (VAPID_SUBJECT)");

  const syncSecret = random(48).toString("base64url");
  const keys = vapid();
  const pushTickSecret = random(24).toString("hex");
  const powersyncRolePassword = random(24).toString("base64url");

  const vercel = [
    ["NEXT_PUBLIC_APP_URL", appUrl],
    ["POWERSYNC_JWT_SECRET", syncSecret],
    ["CALENDAR_TOKEN_KEY", random(32).toString("base64")],
    ["PUSH_TICK_SECRET", pushTickSecret],
    ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey],
    ["VAPID_PUBLIC_KEY", keys.publicKey],
    ["VAPID_PRIVATE_KEY", keys.privateKey],
    ["VAPID_SUBJECT", `mailto:${contact}`],
    // Only read once Google Calendar is set up (push channels); harmless before.
    ["GOOGLE_WEBHOOK_TOKEN_SECRET", random(24).toString("hex")],
  ];
  const missing = [];
  for (const d of FROM_DASHBOARDS) {
    const value = opts[d.flag];
    if (value) vercel.push([d.key, d.flag.endsWith("-url") ? String(value).replace(/\/+$/, "") : String(value)]);
    else missing.push(d);
  }

  return {
    name,
    appUrl,
    vercel,
    missing,
    powersync: {
      kid: SYNC_TOKEN_KID,
      alg: "HS256",
      // The service's key is the secret's own bytes in base64url; the app signs with the secret as text.
      k: Buffer.from(syncSecret, "utf8").toString("base64url"),
      audience: SYNC_TOKEN_AUDIENCE,
      rolePassword: powersyncRolePassword,
    },
    sql: [
      `-- Sparehour ${name}: run in this project's SQL editor after \`supabase db push\`.`,
      `-- The replication role PowerSync connects with gets its own password (the migration's is for the local stack).`,
      `alter role powersync_role password ${sql(powersyncRolePassword)};`,
      `-- The reminder and calendar timers (pg_cron through pg_net) call the app here, presenting this secret.`,
      `insert into private.app_config (key, value)`,
      `values ('app_url', ${sql(appUrl)}), ('push_tick_secret', ${sql(pushTickSecret)})`,
      `on conflict (key) do update set value = excluded.value;`,
    ].join("\n"),
  };
}

/** The environment as the text the script prints. */
export function render(env) {
  const line = "─".repeat(72);
  const out = [
    `Sparehour — ${env.name} (${env.appUrl})`,
    `Every value below is a secret. Keep it out of chat, issues and commits; make a new set for each environment.`,
    "",
    line,
    `1. Vercel → Settings → Environment Variables (scope: this environment). Paste as a .env block:`,
    line,
    ...env.vercel.map(([key, value]) => `${key}=${value}`),
  ];
  if (env.missing.length > 0) {
    out.push("", "   Still to add from the dashboards (or pass the flags and run again):");
    for (const d of env.missing) out.push(`   ${d.key}  ←  ${d.where}  (--${d.flag})`);
  }
  out.push(
    "   Never set ALLOW_DEV_SECRETS, POWERSYNC_INTERNAL_URL or SKIP_TYPECHECK on a hosted environment.",
    "",
    line,
    `2. PowerSync dashboard → the ${env.name} instance`,
    line,
    "   Database connection: the Supabase project's direct connection",
    `     user:     powersync_role`,
    `     password: ${env.powersync.rolePassword}`,
    "   Client auth: HS256 key (JWKS); leave the built-in Supabase auth off",
    `     kid:      ${env.powersync.kid}`,
    `     alg:      ${env.powersync.alg}`,
    `     k:        ${env.powersync.k}`,
    `     audience: ${env.powersync.audience}`,
    "   Sync streams: deploy supabase/powersync/streams.yaml",
    "",
    line,
    `3. Supabase → SQL editor (after the migrations)`,
    line,
    env.sql,
    "",
  );
  return out.join("\n");
}

/** Where `--out` may write: outside the repo, or a `.env*` file in it (git ignores those). */
export function outPathAllowed(path, repo = REPO) {
  const rel = relative(repo, resolve(path));
  const inside = !rel.startsWith("..") && !isAbsolute(rel);
  return !inside || basename(rel).startsWith(".env");
}

function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: "string" },
      url: { type: "string" },
      contact: { type: "string" },
      out: { type: "string" },
      help: { type: "boolean", short: "h" },
      ...Object.fromEntries(FROM_DASHBOARDS.map((d) => [d.flag, { type: "string" }])),
    },
  });
  if (values.help) {
    process.stdout.write(
      [
        "Usage: node scripts/new-env.mjs --name <dev|prod> --url https://<address> --contact <email>",
        "       [--supabase-url …] [--anon-key …] [--service-role-key …] [--powersync-url …] [--out <file>]",
        "Prints a new environment's secrets: the Vercel variables, the PowerSync settings and the SQL (docs/engineering/DEPLOY.md).",
        "",
      ].join("\n"),
    );
    return;
  }
  const text = render(buildEnvironment(values));
  if (values.out) {
    if (!outPathAllowed(values.out)) throw new Error(`--out ${values.out} is inside the repo: use a path outside it, or a git-ignored .env* file`);
    try {
      writeFileSync(values.out, text, { mode: 0o600, flag: "wx" });
    } catch (e) {
      // Never over an earlier run's secrets: those may already be in a dashboard.
      if (e?.code === "EEXIST") throw new Error(`${values.out} already exists: delete it once its values are in the dashboards, or pick another path`);
      throw e;
    }
    process.stdout.write(`Written to ${values.out} (readable by you only). Delete it once the values are in the dashboards.\n`);
  } else {
    process.stdout.write(text);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : e}\n`);
    process.exit(1);
  }
}
