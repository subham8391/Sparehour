I verified everything below against vendor docs, pricing pages, npm and 2026 announcements as of 2026-09-13. Four things changed in the last few months, so memory-based comparisons are out of date:

- **InstantDB is shutting down.** The team joined OpenAI on 22 Aug 2026. New signups are closed and Instant Cloud stops on **31 Aug 2027** ([essay](https://www.instantdb.com/essays/instant_team_joins_openai), [homepage banner](https://www.instantdb.com/)).
- **Electric's managed cloud is closing.** Electric joined Databricks/Neon on 11 Aug 2026: "Electric Cloud is winding down. Cloud users will need to self-host or move to another provider." The code stays Apache-2.0 ([Electric blog](https://electric.ax/blog/2026/08/11/electric-joining-databricks), [TechTarget](https://www.techtarget.com/data-technologies/news/366649200/Databricks-Electric-acquisition-adds-embeddable-PostgreSQL)).
- **Triplit is effectively dormant.** Supabase acqui-hired it in Oct 2025 ([Supabase](https://supabase.com/blog/triplit-joins-supabase)) and the last `@triplit/client` release was 1.0.50 on 31 Jul 2025 (npm).
- **Zero is stable but doesn't do offline writes.** It reached 1.0 ([InfoQ](https://www.infoq.com/news/2026/06/zero-version-1/)) and is now at 1.9.0 (npm, 13 Sep 2026). Its docs still say "Zero doesn't support offline writes" ([docs](https://zero.rocicorp.dev/docs/when-to-use)). Offline, reads keep working, but after about 1 minute disconnected, "writes are rejected" ([docs](https://zero.rocicorp.dev/docs/offline)).

## 1. Comparison table

My cost figures assume a todo app with about 1–5 MB of data per user, about 30% daily-active and about 10% peak concurrency. They are estimates, and they don't include the Postgres bill.

| Option | Status (Sep 2026) | Browser store | Offline writes / conflicts | Multi-tenant permissions | Postgres & server-side writes | Hosting · est. cost 1k / 50k users | License |
|---|---|---|---|---|---|---|---|
| **PowerSync** | GA. Sync Streams GA on 14 May 2026 ([post](https://releases.powersync.com/announcements/sync-streams-are-now-generally-available)). JS SDK v2.0 shipped Jun/Jul 2026 ([changelog](https://powersync.com/blog/powersync-changelog-june-july-2026)) | SQLite in the browser, stored in IndexedDB or OPFS. Multi-tab via shared worker ([docs](https://docs.powersync.com/client-sdk-references/javascript-web)) | **Yes.** Writes are saved locally and replayed to your API in order. Default is per-field last-write-wins, decided by your backend; deletes win ([docs](https://docs.powersync.com/usage/lifecycle-maintenance/handling-update-conflicts)) | SQL stream definitions on the server using `auth.user_id()` and subqueries | **Uses your own Postgres** (Supabase, Neon, RDS). Jobs write straight to Postgres and the change syncs out automatically | Cloud Pro **$49** covers 1k peak clients; +$30 per 1k clients, $1/GB ([pricing](https://www.powersync.com/pricing)). About **$49 / ~$250–500**. Self-host Open Edition free | Server: FSL (turns Apache-2.0 after 2 yrs; no competing products) ([FSL](https://powersync.com/legal/fsl)). SDKs: Apache-2.0 |
| **Zero** (Rocicorp) | 1.0 stable, very active. Users include tldraw, Tines, Shortcut, Productlane ([site](https://zero.rocicorp.dev/)) | IndexedDB (built on Replicache) | **No.** Reads work offline; writes are rejected | Your own server code checks every read and write ("synced queries" and "custom mutators"); works with cookies ([docs](https://zero.rocicorp.dev/docs/auth)) | Uses your own Postgres (needs logical replication). Server writes to Postgres sync out | Managed Hobby **$30**, Pro **$300**, BYOC $1k+ ([site](https://zero.rocicorp.dev/)). Self-host free | Apache-2.0 ([repo](https://github.com/rocicorp/mono)) |
| **Electric + TanStack DB** | Sync engine maintained inside Databricks; **cloud winding down**. TanStack DB is still pre-1.0 (0.9) and its persistence layer is labelled **alpha** ([TanStack](https://tanstack.com/blog/tanstack-db-0.6-app-ready-with-persistence-and-includes)) | SQLite in the browser (OPFS), via TanStack DB 0.6+ | Yes, via `@tanstack/offline-transactions` ([discussion](https://github.com/electric-sql/electric/discussions/3502)). Server decides | Your proxy sets each "shape" (synced subset). Shapes are **one table only, no joins or subqueries** ([docs](https://electric.ax/docs/guides/auth)) | Uses your own Postgres. Reads sync from Postgres; writes go through your own API | Self-host only in practice (one small VM) | Apache-2.0 |
| **InstantDB** | **Sunsetting** (see above) | IndexedDB query cache | Yes, partial | Rules written in Google's CEL | Postgres internally, not your own | No new signups | Apache-2.0 ([repo](https://github.com/instantdb/instant)) |
| **Triplit** | Dormant since Jul 2025 | IndexedDB | Yes | Schema-level roles | Own storage, not Postgres | Self-host | AGPL-3.0 ([repo](https://github.com/aspen-cloud/triplit)) |
| **Jazz** | v2 is an **alpha rewrite**; the old version lives at classic.jazz.tools ([site](https://jazz.tools/)) | Local relational DB | Yes | Row-level security | Not Postgres | Jazz Cloud usage-based; vendor example ≈$23/mo at 1k MAU | MIT ([repo](https://github.com/garden-co/jazz)) |
| **LiveStore** | Beta 0.4, "not yet ready for all production scenarios" ([docs](https://docs.livestore.dev/evaluation/state-of-the-project/)) | SQLite (OPFS), event-sourced | Yes (events) | DIY. Sharing between users is hard ([johnny.sh](https://johnny.sh/blog/choosing-a-sync-engine-in-2026/)) | Not Postgres (Cloudflare, Electric, custom backends) | Self-host | Apache-2.0 |
| **Replicache** | **Maintenance mode**; "migrate to Zero" ([site](https://replicache.dev/)) | IndexedDB | Yes; you write the push/pull backend | DIY | Any database, you build it | Free | Apache-2.0 |
| **Convex** | GA, healthy | **No saved local copy** (in-memory only) | Mutations retried in memory only ([docs](https://docs.convex.dev/client/react)). PowerSync support for Convex is experimental ([post](https://releases.powersync.com/announcements/announcing-convex-backend-support-experimental)) | Your own TypeScript function code | Own database (self-host can use Postgres) | Pro $25 per developer/mo + usage ([pricing](https://www.convex.dev/pricing)). About $25 / ~$75–150 | FSL (turns Apache after 2 yrs) |
| **Firestore** | GA | IndexedDB cache, multi-tab ([docs](https://firebase.google.com/docs/firestore/manage-data/enable-offline)) | **Yes.** Last-write-wins; queue survives reloads | Security Rules | Not Postgres. Admin SDK / Cloud Functions | $0.03 per 100k reads, $0.09 per 100k writes ([pricing](https://firebase.google.com/docs/firestore/standard-edition)). About $0 / ~$50–200 | Proprietary |
| **Supabase Realtime** | GA, but no offline support built in ([PowerSync on Supabase](https://powersync.com/blog/bringing-offline-first-to-supabase)) | None (DIY) | No | Postgres row-level security | Postgres | Pro $25 + compute; 500 peak connections included, then $10 per 1k ([docs](https://supabase.com/docs/guides/realtime/pricing)) | Apache-2.0 |
| *New: Firebase SQL Connect* | Announced Apr 2026; offline cache, real-time, native SQL; web status unclear ([blog](https://firebase.blog/posts/2026/04/cloud-next-2026-announcements/)) | Cache | Unclear | Firebase Auth + SQL | Cloud SQL Postgres | $0.90 per 1M operations | Proprietary |
| *New: Turso Sync* | Browser package is **alpha** ([npm](https://www.npmjs.com/package/@tursodatabase/sync-browser)) | SQLite (OPFS) | Yes | Per-user databases | SQLite, not Postgres | Turso Cloud | MIT |

## 2. Top two for this app

### #1 PowerSync on your own Postgres (Supabase or Neon)

It's the only stable candidate that meets every requirement you set:

- **Local-first:** a real SQLite copy in the browser (IndexedDB or OPFS) with multi-tab support. Reads and writes are local, so the <50 ms target is realistic.
- **Offline:** writes are saved to disk and sent in order when the app reconnects.
- **Postgres stays the source of truth:** your backend decides how conflicts resolve.
- **Server-side jobs are trivial:** the Google Calendar worker, reminders and AI jobs just write to Postgres with any driver, and PowerSync pushes the changes to devices.
- **Permissions:** personal data is filtered with `owner_id = auth.user_id()`. Team spaces use a subquery on a memberships table. Clients subscribe per view or tab.
- **Auth:** it works from JWTs, so Supabase Auth works directly ([guide](https://docs.powersync.com/integrations/supabase/guide)), and better-auth or Auth.js work if you sign your own tokens. A Next.js App Router demo exists ([repo](https://github.com/powersync-ja/powersync-js/blob/main/demos/example-nextjs/README.md)).
- **Cost and exit:** about $49/mo at 1k users. The self-hosted Open Edition is free and has the same features as the cloud, which gives you a way out if you need one.
- **Maturity:** it grew out of JourneyApps' decade-old Fortune-500 field-sync product. Named users include Snackpass and Stanley Black & Decker ([site](https://www.powersync.com/)).

Risks:

- **Small vendor.** About 27 employees; last disclosed raise was in 2017 ([company data](https://www.crunchbase.com/organization/journey-apps)). The FSL licence means you can self-host, but only for non-competing use until each release turns Apache-2.0 after two years.
- **Browser SQLite has sharp edges.** One example is an OPFS bug that permanently locks the connection ([wa-sqlite #86](https://github.com/powersync-ja/wa-sqlite/issues/86)). Safari needs the `OPFSCoopSyncVFS` storage option. SDK v2.0 had breaking changes in July 2026.
- **You write the upload endpoint yourself.** It must be idempotent and check permissions again on the server. You also maintain two data definitions: the server-side sync streams and the client schema.
- **It's client-only.** PowerSync components must be `"use client"`, so server-side rendering only works for page shells.
- **TanStack DB integration exists but is pre-1.0.** Start with PowerSync's own React hooks.

### #2 Zero (conditional: only if you accept "offline = read-only")

For the Linear-style feel it's the best option:

- Fast, reactive local queries.
- Permissions live entirely in your own TypeScript, with plain cookies and no JWT setup.
- Apache-2.0, bring your own Postgres, the most active release cadence of any candidate, and real production users.
- Server jobs write to Postgres and the changes flow out.
- $30–300/mo managed, or self-host.

Risks:

- **It breaks your offline requirement.** Writes are rejected once the client has been disconnected for about a minute. On a plane, users can see their planner but can't check tasks off.
- **Documented gaps** ([InfoQ](https://www.infoq.com/news/2026/06/zero-version-1/)): no server-side rendering, 232 KB gzipped client, Postgres views and `array` columns aren't synced, and the client API can't react to rejected updates or errors.
- **Operations:** zero-cache is a stateful server that needs Postgres logical replication.
- **Vendor:** Rocicorp is a small company.

**Why not Electric + TanStack DB as #2?** On paper it meets the requirements. In practice the managed cloud is closing, the team's focus moved to AI-agent use cases inside Databricks, TanStack DB's persistence is alpha, and shapes can't use joins. One developer spent two months on it and called the long-polling sync "extremely slow and brittle" ([johnny.sh](https://johnny.sh/blog/choosing-a-sync-engine-in-2026/)). It's worth watching, but it's not a safe bet for a solo developer launching a paid product in 2026.

## 3. Boring fallback: Firestore with offline persistence

You already know Firebase, and Firestore meets every functional requirement except Postgres:

- **Offline:** IndexedDB cache with a multi-tab manager and an offline write queue.
- **Permissions:** Security Rules handle personal data plus space membership.
- **Server-side jobs:** the Admin SDK and Cloud Functions cover calendar sync, reminders and AI.
- **Auth:** built in.
- **Shutdown risk:** effectively none.
- **Cost:** roughly $0 at 1k users and about $50–200/mo at 50k.

The price is Google lock-in and no Postgres, which makes a later migration painful. Other caveats:

- Conflicts are last-write-wins only.
- The local cache is not a full replica: it defaults to 100 MB with eviction.
- Clients that were offline for more than 30 minutes are re-billed for a full query when they reconnect ([billing](https://firebase.google.com/docs/firestore/pricing)).
- No joins.

If Postgres is non-negotiable in the fallback too, watch **Firebase SQL Connect**. Its offline cache on Cloud SQL Postgres was announced in April 2026, but its web and GA status is unverified.

**Bottom line:** go with PowerSync on Supabase Postgres, treat Firestore as the fallback, and choose Zero only if you consciously drop offline writes.
