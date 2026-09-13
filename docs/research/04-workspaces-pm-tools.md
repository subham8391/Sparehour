# All-in-One Workspaces and Team PM Tools as Personal Work Managers (research as of 2026-09-13)

Pricing comes from official pricing pages where they rendered. Where a figure comes from a third party or sources disagree, it is marked **(unverified)** or **(conflict)**. The web-search budget ran out near the end, so some items below say explicitly that they are not re-verified.

## Quick pricing and AI snapshot

| App | Free tier (what matters to an individual) | Cheapest paid | AI access |
|---|---|---|---|
| Notion | Unlimited blocks for 1 person, 5MB files, 7-day history, limited AI trial ([pricing](https://www.notion.com/pricing)) | Plus $10/mo ($8 billed annually) | Full Notion Agent only on Business ($20/mo, $16 annually). Custom Agents cost $10 per 1,000 credits |
| ClickUp | 60MB storage, 5 automations and 100 runs, 1 Gantt/dashboard trial ([pricing](https://clickup.com/pricing)) | Unlimited $7 annually / $10 monthly | Add-on: Brain $9/user, Everything AI $28/user |
| Asana | Personal plan: max 2 users, list/board/calendar views, no custom fields, rules or AI ([pricing](https://asana.com/pricing)) | Starter $10.99 annually / $13.49 monthly | AI Studio Basic from Starter (50K credits); AI Teammates is an add-on |
| Trello | 10 boards per workspace, 10 collaborators, 10MB files, 250 command runs, Inbox ([pricing](https://trello.com/pricing)) | Standard $5 annually / $6 monthly | Standard and up (July 2026) |
| Linear | 250 issues, 2 teams, unlimited members, Linear Agent included ([pricing](https://linear.app/pricing)) | Basic $10/user (annual) | Agent on all plans; coding sessions and Loops use credits |
| Taskade | 2 users, 1 agent, 3 Genesis apps, 3 automations, 6,000 one-time credits ([pricing](https://www.taskade.com/pricing)) | Pro $10/mo annual, **flat for 10 users** | Credits by tier (50K per month on Pro) |
| monday.com | 2 seats, 3 boards, no AI ([pricing](https://monday.com/pricing)) | Basic $9/seat with a **3-seat minimum** | 1K–3K credits per month by tier |
| Airtable | 1,000 records per base, 5 editors, 500 AI credits per editor ([plans](https://support.airtable.com/articles/2277136852-airtable-plans-overview)) | Team $20 annually / $24 monthly | All plans get credits |
| Superhuman Docs (formerly Coda) | Free personal docs with no size limit, Docs AI trial | Pro $12 annually / $15 monthly per Doc Maker (unverified) | Docs AI plus MCP |
| MS Planner | Basic tier comes with Microsoft 365 | Plan 1 $10/user | Needs a Microsoft 365 Copilot license |
| Jira | 10 users, 2GB, 100 automation runs | Standard about $7.91 (unverified) | "Rovo included on every paid plan" ([Atlassian](https://www.atlassian.com/software/jira/guides/more/jira-editions)) |

---

## 1. Notion (including Calendar, Mail and AI/Agents)

**Features**
- **Capture:** Web clipper; `/` slash commands; Markdown shortcuts; save emails to pages; voice dictation in Notion Agent ([3.4](https://www.notion.com/releases/2026-04-14)); AI Meeting Notes
- **Organize:**
  - Databases with typed properties, relations, rollups and formulas
  - Sub-items; database templates
  - Native repeating templates for recurring tasks, on all plans including Free ([2sync](https://2sync.com/blog/how-to-create-recurring-tasks-on-notion))
  - Buttons; forms
  - "Can create pages" permission ([3.4](https://www.notion.com/releases/2026-04-14))
- **Views:** Table, board, list, calendar, timeline, gallery, chart, form, with per-view filters and sorts
- **Planning & Time:**
  - `@remind` date reminders
  - Notion Calendar: free, on web, macOS, Windows, iOS and Android; Google, iCloud and Outlook accounts; shows database dates ([help](https://www.notion.com/help/notion-calendar-apps))
  - No native time tracking; no goals object (you template it)
- **AI:**
  - Notion Agent, rebuilt for 3.0 (Sep 18, 2025): runs multi-step jobs of 20+ minutes, with memory ([3.0](https://www.notion.com/releases/2025-09-18))
  - Custom Agents (3.3, Feb 24, 2026): run on schedules or triggers; connect to Slack, Mail, Calendar and MCP (Linear, Figma) ([3.3](https://www.notion.com/releases/2026-02-24))
  - AI Autofill that keeps enriching and categorizing database rows
  - Skills (saved reusable commands)
  - AI Meeting Notes can trigger Custom Agents (Jul 31, 2026)
  - Agent calendar and scheduling tools (Jul 16, 2026)
  - Per-agent model controls (Sep 9, 2026) ([releases](https://www.notion.com/releases))
  - Hosted MCP server at mcp.notion.com ([blog](https://www.notion.com/blog/notions-hosted-mcp-server-an-inside-look))
- **Collaboration:** Real-time editing, comments, guests (10 on Free), page-level sharing
- **Integrations & API:** Public API; AI connectors (Slack, Gmail/Outlook, Salesforce, Box); Workers developer platform (beta, credit charges from Oct 15 per the pricing page)
- **Platforms:** Web, macOS, Windows, iOS, Android. Offline mode since Aug 2025, but only for pages you download; AI, embeds and forms need a connection ([9to5Mac](https://9to5mac.com/2025/08/20/notion-offline-mode/))
- **Pricing:**
  - Free / Plus $10 ($8 annually) / Business $20 ($16 annually) / Enterprise ([pricing](https://www.notion.com/pricing))
  - Free and Plus get only a limited AI trial
  - Database automations need Plus or above; Free can only create Slack-notification automations ([help](https://www.notion.com/help/database-automations))

**Why individuals use it for tasks:** Tasks sit in the same databases as notes, projects, journals and wikis. Relations and backlinks tie tasks to docs, and templates are everywhere.

**Praise:** Flexible data model; docs and tasks in one place; the template ecosystem; a free Calendar that works well.

**Complaints:**
- Heavy and laggy, especially on mobile and in databases with 2,000+ pages; the learning curve ([Capterra](https://www.capterra.com/p/186596/Notion/reviews/))
- Recurring tasks appear only on the day they are due, so you cannot see future instances ([2sync](https://2sync.com/blog/how-to-create-recurring-tasks-on-notion))
- Notifications are noisy; reminders are weak compared with a dedicated to-do app
- Setup fatigue ("build your own system")
- AI is effectively paywalled behind Business, and credit-based pricing adds complexity

**Recent changes:**
- Notion Mail launched Apr 2025 ([2.50](https://www.notion.com/releases/2025-04-15)). **Its standalone inbox is being shut down on Sep 22, 2026** (announced Jun 25, 2026). Notion's reason: more than half of Mail users now handle email through agents ([help](https://www.notion.com/help/notion-mail-inbox-is-going-away-what-to-do-next))
- Custom Agents moved to paid credits on May 4, 2026; running them became 35–50% cheaper
- 28% faster initial page render (Apr 2026)

## 2. ClickUp

**Features**
- **Capture:** Quick-create; Inbox and Drafts on Home; AI Notetaker turns meetings into action items ([4.0](https://clickup.com/blog/clickup-4-0/)); Brain MAX app (mobile launched Jun 2026)
- **Organize:**
  - Space → Folder → List → Task → Subtask hierarchy
  - Custom statuses; custom fields (limited on Free); task types, with fields by task type (Mar 2026)
  - Dependencies and relationships; templates
  - Private "Personal Lists" (4.0)
- **Views:** List, Board, Calendar, Gantt (300% faster rendering, Mar 2026), Table, Timeline, Workload, Mind Map (Business), Whiteboard, Doc, Form, Chat, Dashboards
- **Planning & Time:**
  - AI Planner/calendar that auto time-blocks priorities and meetings and re-plans as they shift; focus sessions (4.0)
  - Reminders; recurring tasks; native time tracking; Goals
- **AI:**
  - Brain (multi-model: GPT, Claude, Gemini)
  - Super Agents (Feb 2026): you can @mention them, assign them tasks, or trigger them from automations or schedules ([changelog](https://feedback.clickup.com/changelog/super-agents-release-notes-takeover))
  - Brain2 (Jun 2026): rebuilt context layer that generates slide decks, dashboards and apps
  - AI fields; AI automations; "ambient" answers
  - Codegen acquisition (Nov 2025) ([news](https://clickup.com/learn/topic/project-management/tools/clickup/news/))
- **Collaboration:** Chat connected to tasks, comments, whiteboards, Teams Hub with AI stand-ups
- **Integrations & API:** Public API; about 1,000 integrations (not re-verified); official hosted MCP server
- **Platforms:** Web, macOS, Windows, Linux (not re-verified), iOS, Android
- **Pricing:**
  - Free / Unlimited $7 ($10 monthly) / Business $12 ($19 monthly) / Enterprise ([pricing](https://clickup.com/pricing))
  - AI is a per-seat add-on: Brain $9, Everything AI $28 (with Super Credits)

**Why individuals use it:** One tool that has every view plus native time tracking, goals and docs. Power users and freelancers use it to run their whole work life.

**Praise:** Unmatched breadth of views; a generous Free plan (unlimited members and tasks); native time tracking; a real calendar with time-blocking in 4.0.

**Complaints:**
- An overwhelming UI with "buttons everywhere"
- Sluggish when loading large spaces or switching views
- "Not a tool you can use halfway"; heavy setups decay without upkeep ([G2](https://learn.g2.com/clickup-review), [Capterra](https://www.capterra.com/p/158833/ClickUp/reviews))
- The AI add-on can double the bill

**Recent changes:** 4.0 shipped Dec 8, 2025 with converged navigation (3.0 deprecated Mar 27, 2026); Super Agents; Brain2; Everything AI tier (Jan 2026).

## 3. Asana (Personal/free plan)

**Features**
- **Capture:** Quick add; email-to-task (long-standing, not re-verified); AI Connectors create work from Claude, ChatGPT and Gemini conversations ([Spring 2026](https://asana.com/inside-asana/spring-release-2026))
- **Organize:**
  - Tasks, subtasks and sections
  - Multi-homing: one task can live in several projects
  - Recurring tasks; custom fields, forms and rules (Starter+)
  - Dependencies (plan tier not verified)
- **Views:**
  - Personal: list, board, calendar
  - Starter: timeline/Gantt and dashboards
  - Advanced: workload
- **Planning & Time:**
  - My Tasks (sectioned personal list; widely rated one of the best personal views in a team tool) ([review](https://work-management.org/project-management/asana-review/))
  - Inbox; due dates and times
  - Time tracking through integrations on Personal, native on Advanced; Goals and portfolios on Advanced
- **AI:**
  - AI Studio Basic (credits from Starter)
  - AI Teammates add-on: multi-user agents that triage overdue work, spot dependencies and suggest priorities ([overview](https://asana.com/resources/ai-teammates-overview))
  - Hosted MCP server, V2 with about 17 tools ([docs](https://developers.asana.com/docs/using-asanas-mcp-server))
- **Collaboration:** Comments, status updates, followers, unlimited free guests (Starter)
- **Integrations & API:** 100+ integrations on Free; REST API
- **Platforms:** Web, macOS, Windows, iOS, Android
- **Pricing:**
  - Personal $0 (capped at **2 users** for accounts created after Nov 12, 2025 per [costbench](https://costbench.com/software/project-management/asana/free-plan/), unverified date)
  - Starter $10.99 / Advanced $24.99 annually ([pricing](https://asana.com/pricing))

**Praise:** My Tasks and Inbox are polished; a clean, reliable UI; unlimited tasks on Free.

**Complaints:**
- Heavy for solo use: the workspace/team/project hierarchy is a lot to learn
- Free lacks custom fields, rules, timeline and AI
- Weak support for free users ([seatable](https://seatable.com/asana-reviews/))

**Recent changes:** Personal plan capped at 2 users; AI Teammates (fall 2025, expanded 2026); Spring 2026 release (May 20) added AI Connectors and a Timesheets & Budgets add-on.

## 4. Trello

**Features**
- **Capture:**
  - Personal Inbox: forward email to inbox@app.trello.com, Slack message reactions, Teams, Siri voice, Jira JQL feeds
  - AI parses dates and action items from captured text ([Atlassian, Feb 2025](https://www.atlassian.com/blog/announcements/trello-personal-productivity))
- **Organize:** Boards, lists and cards; checklists; labels; card mirroring across boards; custom fields; Butler automation (250 runs per month on Free); unlimited Power-Ups on Free
- **Views:** Board on Free; Calendar, Timeline, Table, Dashboard and Map on Premium ([pricing](https://trello.com/pricing))
- **Planning & Time:**
  - Planner: drag cards onto Google or Outlook calendar slots ([planner](https://trello.com/planner))
  - Plan tiers **(conflict):** the pricing page says view-only on Standard and full on Premium
- **Focus & Habits:** AI-recommended focus time blocks (Jul 2026)
- **AI:**
  - Seven AI features for all paid plans (Jul 2026): AI-built boards, card merging, generated checklists, focus time, AI images, due dates parsed from card titles ([Reworked](https://www.reworked.co/collaboration-productivity/trello-rolls-out-7-ai-features-for-paid-plans/))
  - MCP connection to Claude, ChatGPT, Gemini and Cursor
- **Integrations & API:** Power-Ups, REST API, webhooks
- **Platforms:** Web, macOS, Windows, iOS, Android
- **Pricing:** Free / Standard $5 / Premium $10 / Enterprise $17.50 (annual)

**Praise:** Instantly understandable; Inbox and Planner finally give it a personal "capture → schedule" loop.

**Complaints:** Inbox and Planner are "clean but shallow" ([Zapier](https://zapier.com/blog/trello-alternatives/)); only one view on Free; the 10-board cap; weak hierarchy and recurring (mostly via Butler or Power-Ups).

**Recent changes:** Its personal-productivity pivot (Inbox + Planner, GA Apr 2025) is the clearest case of a team tool repositioning around the individual.

## 5. Linear (the speed benchmark)

**Features**
- **Capture:**
  - `C` creates an issue from anywhere; drafts; email-to-issue ([docs](https://linear.app/docs/creating-issues))
  - Slack; Asks (Business); a Triage inbox per team
- **Organize:**
  - Issues, sub-issues, projects, initiatives with properties (Jul 2026), and cycles
  - Custom workflow statuses per team; labels and label groups; priority; estimates
  - Relations: blocks, blocked-by, related, duplicate
  - Templates; **recurring issues exist** ([docs](https://linear.app/docs/creating-issues)). One 2026 review claims they don't ([Sunrise Digest](https://thesunrisedigest.com/focus/linear-for-personal-use-review-2026/)); the official docs contradict it.
  - Limited arbitrary custom fields
- **Views:** List, board, project timeline/roadmap, saved and shared filtered views, Insights (Business)
- **Planning & Time:**
  - My Issues; Inbox with a Priority tab (Sep 2026)
  - Issue reminders (`H`, natural language like "next Tuesday") ([changelog](https://linear.app/changelog/2023-01-31-issue-reminders))
  - Snooze; Pulse daily summaries; cycles as timeboxes; due dates
  - No time tracking
- **AI:**
  - Linear Agent (public beta Mar 24, 2026, **included on all plans**) ([changelog](https://linear.app/changelog/2026-03-24-introducing-linear-agent))
  - Triage Intelligence; Code Intelligence ([May 2026](https://linear.app/changelog/2026-05-14-code-intelligence))
  - Coding sessions through Claude Code and Codex ([Jun 2026](https://linear.app/changelog/2026-06-11-coding-sessions))
  - Loops: recurring agent workflows (Jul 20, 2026)
  - Agent-assisted editing; AI-drafted project updates
  - Delegating issues to agents
  - Hosted MCP server since May 1, 2025 ([changelog](https://linear.app/changelog/2025-05-01-mcp))
- **Collaboration:** Comments, project docs and updates, guests (Business), Slack sync
- **Integrations & API:** GraphQL API, webhooks, GitHub/GitLab, Slack, Zendesk and Intercom (Business)
- **Platforms:** Web, macOS, Windows, iOS, Android; no Linux ([download](https://linear.app/download))
- **Pricing:** Free (250 issues, 2 teams) / Basic $10 / Business $16 per user annually / Enterprise ([pricing](https://linear.app/pricing)). Pricing was updated Aug 20, 2026 ([changelog](https://linear.app/changelog)).

**What makes it fast:**
- A local-first sync engine: the whole workspace is bootstrapped into IndexedDB, so every read renders from local data
- Mutations are applied optimistically to the local model and queued, then sent to the server as GraphQL, with WebSocket delta sync coming back ([reverse-engineering](https://github.com/wzhudev/reverse-linear-sync-engine), [Fujimoto](https://www.fujimon.com/blog/linear-sync-engine)). Result: most pages load in under 50ms and there are no spinners ([byteiota](https://byteiota.com/local-first-architecture-linears-50ms-page-load-secret/)).
- Keyboard UX:
  - `Cmd+K` command menu exposes every action by name
  - `G`-then-letter navigation (`G I` inbox, `G M` my issues, `G T` triage)
  - Single-key property edits (`S` status, `P` priority, `L` labels, `A`/`E` assign)
  - `/` instant filter; bulk multi-select with `X` ([shortcut.fyi](https://shortcut.fyi/linear-shortcuts))
- Opinionated defaults with minimal configuration

**Praise (personal use):** Its "interaction design is in a different league"; cycles force honest weekly planning; roadmaps for long projects.

**Complaints (personal use):** Formal issue ceremony for small tasks like groceries; assignees and team statuses are clutter for one person; the mobile app is a "companion" app; it is expensive per seat for one person; the Free plan's 250-issue cap ([Sunrise Digest](https://thesunrisedigest.com/focus/linear-for-personal-use-review-2026/)).

## 6. Taskade

**Features**
- **Capture:** Generate whole projects from a prompt; mobile quick add (apps rebuilt Oct 30, 2025)
- **Organize:** Outline-style hierarchical projects, workspaces and folders, 500+ templates
- **Views:** List/outline, board, table (default for AI-created projects since Aug 2025), calendar, mind map ([help](https://help.taskade.com/en/articles/8958390-mind-map-view)), org chart, Gantt (the last three are not individually re-verified)
- **AI:**
  - AI agents trained on your files and projects that run 24/7
  - Multi-agent teams (Business)
  - Automations with branching and loops (Jul 2025)
  - Genesis prompt-to-app builder (preview Aug 9, 2025) ([changelog](https://docs.taskade.com/changelog/changelog/2025.md))
  - 15+ models; bring your own API key (Enterprise)
- **Collaboration:** Real-time editing, chat, sharing; Pro includes 10 users
- **Platforms:** Web, macOS, Windows, iOS, Android
- **Pricing:**
  - Free / Pro $10/mo annual ($120/yr) / Business $25 / Max $100 / Enterprise $250 ([pricing](https://www.taskade.com/pricing))
  - These are **flat per workspace, not per seat**
  - The exact monthly-billing price is unclear: the official page presents it inconsistently

**Praise:** The most AI per dollar; flat pricing; mind map and outline are good for thinking.

**Complaints:** The pivot to an "AI app builder" dilutes the core task product; credit systems are confusing; the Free plan's credits are one-time only.

## 7. monday.com (Work Management)

**Features**
- **Organize:** Boards with items and subitems, typed columns (8 column types on Free), dependencies, forms, Docs; automations (250/mo on Standard, 25K on Pro); My Work aggregated view (long-standing)
- **Views:** Table and Kanban on Free; Timeline, Gantt and Calendar from Standard; time-tracking column on Pro ([pricing](https://monday.com/pricing))
- **AI:**
  - Sidekick assistant; AI agent workforce; Vibe app builder; meeting notetaker; AI columns; AI workflow builder (Pro)
  - 1K/2K/3K credits per month by tier
  - Since Mar 1, 2026, Standard and Pro get 5 free Sidekick messages per seat per day (press release, unverified)
  - Official MCP ([blog](https://monday.com/blog/ai-agents/everything-monday-ai-can-do/))
- **Platforms:** Web, desktop, iOS, Android
- **Pricing:**
  - Free: 2 seats, 3 boards, 200 items per [third party](https://www.usecarly.com/blog/monday-free-plan-limits/)
  - Basic $9 / Standard $12 / Pro $19 per seat, **minimum 3 seats**, so a solo user pays at least $27/month ([alfred](https://get-alfred.ai/blog/monday-pricing))

**Personal fit:** Poor. The pricing floor, board-centric data entry and team framing all get in the way. It is praised for visual dashboards and automations.

## 8. Airtable (brief)

- **Organize and views:** A relational database (linked records, formulas, rollups); grid, kanban, calendar, gallery, timeline/Gantt and form views; automations
- **AI:** Omni conversational builder (AI-native relaunch Jun 24, 2025) and field agents
- **Standalone agent products:** Superagent launched Jan 27, 2026 ([community](https://community.airtable.com/announcements-6/introducing-superagent-47365)). Reportedly folded into HyperAgent by Apr 2026 (unverified; the source is a competitor's blog).
- **Pricing:** Free (1,000 records per base, 5 editors, 1GB attachments per base, 1,000 API calls per month, 2-week history, 500 AI credits per editor) / Team $20 annually, $24 monthly (50K records) / Business $45 ([plans](https://support.airtable.com/articles/2277136852-airtable-plans-overview))
- **Personal fit:** Great for tracking structured data; weak as a to-do app (no native reminders or today view).

## 9. Coda → Superhuman Docs (brief)

- **Ownership:** Grammarly renamed itself Superhuman on Oct 29, 2025 ([Grammarly](https://www.grammarly.com/blog/company/announcing-company-rebrand-to-superhuman/)). **Coda became "Superhuman Docs" on Jul 8, 2026** ([Superhuman blog](https://blog.superhuman.com/introducing-superhuman-docs/)).
- **Organize:** Docs with tables, formulas, buttons, automations and Packs (integrations)
- **AI:** A rebuilt Docs AI that builds inside your doc; MCP available to everyone; Superhuman Go assistant
- **Pricing:**
  - Free personal docs with no size or object limits
  - Pro $15/mo or $12 annually per Doc Maker; Business $40 or $33, effective Aug 25, 2026 ([breeze.pm](https://www.breeze.pm/articles/coda-is-now-superhuman-docs), unverified)
  - The official pricing page did not render
  - Only Doc Makers pay; editors and viewers are free
- **Personal fit:** For builders of doc-apps. Its future direction depends on Superhuman, which is a platform risk.

## 10. Microsoft Planner / To Do / Loop

**Features**
- **Planning:**
  - Planner "My Tasks" and "My Day" (My Day clears every night)
  - Planner tasks assigned to you flow into Microsoft To Do and appear as My Day suggestions ([support](https://support.microsoft.com/en-us/planner/training/manage-your-tasks-with-my-tasks-and-my-day))
- **Views:** Grid, Board, Schedule and Charts on Basic; Timeline/Gantt, dependencies, goals, sprints and backlogs on Premium Plan 1
- **AI:**
  - Project Manager agent renamed **Planner Agent** in mid-Mar 2026. It can be assigned tasks and writes its output into an embedded Loop page.
  - Agent chat in Basic plans rolling out late Aug–late Sep 2026 ([MC1443514](https://mc.merill.net/message/MC1443514))
  - Requires a Microsoft 365 Copilot license
- **Pricing:** Basic tier included with Microsoft 365; Plan 1 $10; Planner and Project Plan 3 $30 ([costbench](https://costbench.com/software/project-management/microsoft-planner/), unverified)
- **Loop:**
  - Planner component retired Jan–Feb 2026
  - Copilot-generated recaps retired May 2026
  - Being folded into Copilot Pages ([WindowsForum](https://windowsforum.com/threads/microsoft-retires-copilot-generated-recaps-in-loop-may-2026-manual-still-works.409674/))

**Personal fit:** Default choice for people inside Microsoft 365. The To Do + My Day daily-reset pattern is worth studying. Otherwise it is fragmented across apps, and AI costs extra.

## 11. Jira (brief)

- **Pricing:** Free for up to 10 users, with 2GB storage and 100 automation rule runs per month ([Atlassian](https://www.atlassian.com/software/jira/guides/more/jira-editions))
- **AI:** Atlassian says "Rovo AI is included on every paid plan." Some third parties still say Premium-only **(conflict)**.
- **Personal fit:** Some developers track side projects in it, but it is overkill: heavy configuration, slow UI and no personal views.

## 12. Height (status: shut down)

- Shutdown announced Mar 20, 2025; **offline since Sep 24, 2025**; customer data deleted within 30 days ([HN](https://news.ycombinator.com/item?id=43454034), [AlternativeTo](https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/))
- Height 2.0 (Oct 2024) had billed itself as "autonomous project collaboration": AI triage, backlog pruning, auto-updating specs
- Shortcut offered migrants 6 months free ([Shortcut](https://www.shortcut.com/import/height/))
- **Lesson:** Being AI-native was not enough to sustain the business, and users lost their data.

## 13. Newer entrants worth watching

**Superlist** (from Wunderlist's founder) — personal tasks and notes with light sharing
- Tasks inside notes; natural-language and voice capture; AI Meeting Notes that generate tasks without a visible bot
- Integrations: Gmail, Google Calendar, Slack, Linear, GitHub
- Platforms: macOS, iOS, Android, Web
- Pricing: Free (5 lists, 5 people per shared list) / Basic $5/mo or $59/yr / Super $21/mo or $249/yr ([pricing](https://www.superlist.com/pricing))
- It is the closest to a "personal-first with light sharing" model.

**Plane** — open-source (AGPL) alternative to Linear and Jira
- Can be self-hosted
- Cloud Pro $6/seat, Business $13 ([pricing](https://plane.so/pricing), [teardown](https://dev.to/beton/plane-pricing-teardown-2026-7ca))
- Official MCP server

---

## Segment-level takeaways

**What individuals borrow from team tools:**
- A **personal aggregation layer** over structured data: Asana My Tasks and Inbox, Linear My Issues and Inbox, ClickUp Home, monday My Work, Planner My Day
- **Custom properties and relations** (Notion, Airtable)
- **Multiple views of the same data** (ClickUp, Notion)
- **Timeboxing:** Linear cycles work well as personal weekly sprints
- **Capture everywhere:** Trello Inbox takes email, Slack, Siri and Teams
- **Tasks inside docs** (Notion, Coda, Superlist)
- **Lightweight dependencies**

**What is overkill for one person:** Workload/capacity planning, portfolios, access-control permissions, story points, Gantt baselines, multi-level hierarchies (ClickUp's Space→Folder→List), assignee and triage ceremony, per-seat pricing and seat minimums (monday's 3 seats).

**Design patterns worth copying:**
1. **Linear's speed architecture:**
   - A local-first store with optimistic mutations and background sync, so there is no spinner anywhere
   - `Cmd+K` exposes every action; single-key property edits; `G`-then-letter navigation
   - Natural-language reminders (`H` → "next Tuesday"); snooze
2. **Notion's databases:** Typed properties, relations and formulas with saved views, but shipped with opinionated defaults so users don't have to build a system.
3. **Views on demand:** ClickUp breadth, but only where it helps an individual: list, board, calendar/time-block, timeline, and possibly mind map (Taskade).
4. **Capture → schedule loop:** Trello Inbox → Planner drag-to-calendar; ClickUp 4.0's auto time-blocking planner; Trello's AI focus-time.
5. **Daily reset:** Microsoft's My Day clears every night.
6. **Multi-homing:** Asana lets one task live in several lists or projects.
7. **AI table stakes for 2026:**
   - Natural-language date and property parsing
   - Autofill and categorization of properties (Notion Autofill)
   - Meeting notes → tasks (Notion, ClickUp, Superlist)
   - Prompt → project or board (Trello, Taskade)
   - Agents as assignees or delegates (Linear, ClickUp Super Agents, Asana AI Teammates, Planner Agent)
   - Scheduled/recurring agent workflows (Notion Custom Agents, Linear Loops)
   - An official hosted MCP server. Every major player has one: Notion, Linear, Asana, ClickUp, monday, Trello/Atlassian, Superhuman Docs, Plane.

**Failure modes to avoid:**
- **Bloat and setup fatigue:** ClickUp's "can't use it halfway"; Notion's "build your own system" plus lag on mobile and big databases.
- **AI paywalls and credit confusion:** ClickUp's $9–$28 add-ons, Notion AI only on Business plus credits, monday and Taskade credits. Individuals hate metered AI.
- **Free-tier cliffs:** Linear's 250 issues, Trello's 10 boards, Airtable's 1,000 records, monday's 3 boards, Asana's 2 users.
- **Product churn and trust loss:**
  - Height shut down and deleted data
  - Notion Mail shut down after 17 months
  - Loop features retired
  - Coda rebranded
  - Airtable's Superagent reportedly replaced within months (unverified)
- **Weak personal primitives in team tools:** Notion's recurring tasks can't be seen ahead; noisy notifications and unreliable reminders; "companion-grade" mobile apps (Linear, Notion).

**Gaps a personal-first app can own:**
1. **Linear-grade speed plus Notion-grade flexibility, without the setup:** built-in Inbox, Today and Upcoming, with custom properties and relations optional.
2. **Reliable reminders and recurrence:** future instances visible ahead of time, natural-language input, snooze, and nagging when needed.
3. **Native time-blocking:** tasks and calendar in one place, where team tools make it a paid tier or a separate app.
4. **Life areas beyond work**, with no team ceremony: no assignees or triage for one person.
5. **Flat individual pricing with useful AI included:** "light sharing" without seats or workspaces.
6. **True offline and local-first**, with data export as a trust promise given the shutdowns above.
7. **A personal agent plus two-way MCP:** it acts on your tasks (plan my day, reschedule, turn meeting notes into tasks) and lets outside AI tools read and write your task list.
