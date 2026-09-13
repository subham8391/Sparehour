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

## Development
Stack so far: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · npm.

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npm run build
```
