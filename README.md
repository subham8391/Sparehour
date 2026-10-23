# Sparehour

**Find the spare hours in your day.** A calm personal planner that knows how much free time you really have and never makes you feel behind.

> Status: **pre-M1**. The repository is scaffolded; product code hasn't started. The data/sync layer is still undecided (see [docs/DECISIONS.md](docs/DECISIONS.md)).

## What it is
- **A Today that knows your time** — your working hours minus meetings minus a buffer, with a warning the moment you plan more than fits.
- **A guilt-free planning loop** — tasks you didn't get to move quietly into a "Carried over" section instead of piling up as red overdue counts. Only real deadlines turn red.
- **Calendar-native** — drag tasks into time blocks that sync with Google Calendar.
- **Calm and keyboard-first** — fast capture in plain English, Cmd+K for everything, installable as a web app (PWA).

## Docs
| Doc | What's in it |
|---|---|
| [docs/DECISIONS.md](docs/DECISIONS.md) | Every product decision so far, plus the open questions |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature catalogue tagged by milestone (M1 / M2 / M3 / Later / Never) |
| [docs/product/](docs/product/) | Product spec, onboarding flow and screen-by-screen behaviour |
| [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) | The "Daylight" design system: tokens, type, components, motion; mockup sources in `docs/design/mockups/` |
| [docs/engineering/](docs/engineering/) | System design: architecture, data model, sync, engines, integrations |
| [docs/research/](docs/research/) | Market research: 54 competitor apps, user pain points, trends, sync-engine options |

## Roadmap
| Milestone | Exit test |
|---|---|
| **M1 — daily driver** | Used every workday for 2 weeks with no other todo app |
| **M2 — private beta** | 10–30 users, still active in week 4 |
| **M3 — public launch** | Billing, onboarding, landing page, data export |

## Connect Claude to Sparehour
Claude can read your planner and, if you let it, change it: add tasks in quick-add words ("Draft proposal fri 3pm ~45m #Acme"), see Today with its spare time, the Inbox and Upcoming, complete, move and edit tasks, search, and keep your lists. It signs in as you through Sparehour's own consent screen, where you choose **Read and change** or **Read only**; Settings › Connected apps changes that or disconnects.

The address is `https://sparehour-dev.vercel.app/api/mcp` (Settings › Connected apps shows it with a Copy button).

- **claude.ai** (and the phone apps, which pick it up): Settings → Connectors → **Add custom connector**, name `Sparehour`, the address above, **Add**, then **Connect**. Sparehour's sign-in opens; sign in, choose what Claude may do, **Allow**. In a chat, switch Sparehour on from the tools menu. On a Team or Enterprise plan an owner adds the connector for the organisation first.
- **Claude Desktop**: the same, under Settings → Connectors → **Add custom connector** (a connector added on claude.ai is already there).
- **Claude Code**: `claude mcp add --transport http sparehour https://sparehour-dev.vercel.app/api/mcp`, then `/mcp` → `sparehour` → **Authenticate**; the browser opens the consent screen.
- **Locally**, against `npm run dev:stack`: run the app on port 3100 (`npm run build && npx next start -p 3100`; the local auth server sends consent there) and use `http://localhost:3100/api/mcp` from Claude Code. claude.ai cannot reach your machine.

The tools: `get_today`, `get_inbox`, `get_upcoming`, `get_task`, `search`, `list_projects`, `get_lists`, `get_list` (read); `add_task`, `complete_task`, `reopen_task`, `reschedule_task`, `update_task`, `drop_task`, `create_list`, `add_list_items`, `update_list_item` (write, refused on a read-only connection). The design is in [docs/DECISIONS.md](docs/DECISIONS.md) (amendment 2026-10-23).

## Development
Stack so far: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · npm.

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
```
