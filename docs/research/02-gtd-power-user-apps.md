# GTD, power-user and outliner task managers: competitive research (as of 2026-09-13)

**How I sourced this:**
- Pricing and recent features come from official pricing pages, changelogs and roadmaps, fetched in September 2026.
- My tools could not reach Reddit (blocked for both search and fetch). User sentiment comes from Capterra, G2, App Store and Play reviews, Product Hunt, vendor forums (Omni, Logseq), and 2025–26 review blogs.
- Anything I could not verify is marked **(unverified)**.
- I used up the session's web-search budget before the end, so a few late details are marked unverified rather than re-checked.

---

## 1. OmniFocus (The Omni Group)

**Features**
- *Capture*
  - Quick Entry window (Mac)
  - Mail Drop email-to-inbox
  - Share sheet, Siri and Shortcuts actions
  - Apple Watch capture
  - Shortcuts actions in Spotlight on macOS 26
- *Organize*
  - Projects can be parallel, sequential, or single-action lists
  - Folders
  - Nested action groups
  - Multiple tags per item, hierarchical
  - Mutually exclusive tags
  - Project status: active, on hold, completed, dropped
- *Views*
  - Built-in perspectives: Inbox, Projects, Tags, Forecast, Flagged, Review
  - Custom perspectives with nested all/any/none rule groups (Pro)
  - Per-perspective display fields (Pro)
  - Focus mode that narrows the whole database to chosen folders or projects (Pro)
- *Planning & Time*
  - Defer, Due and **Planned** dates (Planned added in 4.7, 2025)
  - Estimated duration
  - Repeats scheduled from due, defer or a fixed schedule
  - Forecast view with calendar overlay
  - Per-project review intervals
- *AI*
  - Apple on-device Foundation Models, available via Omni Automation plug-ins
  - MCP support "under serious consideration"
- *Integrations & API*
  - Omni Automation (JavaScript, runs on every platform)
  - AppleScript (Mac)
  - Shortcuts
  - URL scheme
  - CarPlay and watchOS 26 Control Center controls
- *Platforms*
  - Mac, iPhone, iPad, Apple Watch, Vision Pro
  - Web (a subscription add-on); no Android or Windows app
- *Pricing* ([buy page](https://www.omnigroup.com/omnifocus/buy))
  - Standard license: **$74.99**
  - Pro license: **$149.99** (universal purchase)
  - Subscription: **$99.99/yr**, always the latest Pro version
  - Web-only access: **$4.99/mo**
  - 14-day trial

**Analysis**
- **Positioning:** The reference GTD engine for Apple power users. Apple-only by design.
- **Methodology:** Full GTD: inbox, next actions through sequential projects and tag availability, waiting-for via tags, someday via on-hold projects, and a dedicated Review perspective.
  - No built-in Eisenhower or Ivy Lee; people build those with perspectives and flags.
- **What makes it strong:**
  - Availability is computed. Deferred, blocked-by-sequence and on-hold items drop out of "Available" views, and custom perspectives then filter on that computed state.
  - The Pro/Standard split is the main paywall. Custom perspectives, Focus and automation are all Pro-only ([features](https://www.omnigroup.com/omnifocus/features)).
- **Review:** Each project has its own review interval (for example every 2 weeks), and the Review perspective surfaces projects that are due for review. This is the best-in-class implementation of the GTD weekly review.
- **Data ownership:** Local database, synced through the Omni Sync Server with end-to-end encryption. New sync servers in Amsterdam and Singapore are being tested ([mid-2026 roadmap](https://learnomnifocus.com/omni-roadmap-2026-mid-year-omnifocus-highlights/)).
- **Praise:** Depth of perspectives, reliability, review workflow, automation, polish on Apple platforms.
- **Complaints** ([Capterra](https://www.capterra.com/p/177722/OmniFocus/reviews/), [2026 review](https://merazoo.com/omnifocus-review-2026/)):
  - Steep learning curve: "weeks setting it up"
  - $100/yr subscription resentment
  - Hard to use comfortably without Pro
  - Fiddly repeat setup
  - Web version is weaker than the native apps
  - Apple lock-in
- **Recent changes (2025–26)** ([Omni Roadmap 2026](https://www.omnigroup.com/blog/omni-roadmap-2026)):
  - 4.6: attachments and notes
  - 4.7: Planned dates
  - 4.8: Liquid Glass redesign and new Perspectives Bar, Foundation Models via plug-ins, CarPlay
  - 4.8.x maintenance releases, currently 4.8.13 ([omnigroup.com/omnifocus](https://www.omnigroup.com/omnifocus/))
  - Kanban view announced but **still unshipped** as of mid-2026; the 2026 plan is "refinements," Siri/App Intents for OS 27, and possibly MCP ([learnomnifocus](https://learnomnifocus.com/omni-roadmap-2026-mid-year-omnifocus-highlights/))

---

## 2. Amazing Marvin

**Features**
- *Capture*
  - Braindump
  - Quick add
  - Mobile apps
  - Email-to-Marvin and API/Zapier (long-standing; **unverified for 2026**)
- *Organize*
  - Categories and projects with subtasks
  - Labels, which can act as contexts
  - Importance levels
  - Sequential projects
  - Start dates and end dates
  - Dependencies
  - Backburner (a someday list)
  - Custom sections ([strategy list](https://help.amazingmarvin.com/en/collections/1139197-strategies))
- *Views*
  - Smart Lists
  - Custom Screens and Dashboard
  - Matrix (Eisenhower)
  - Master list plus a daily "Today" list
  - Lists, boards and timelines
  - Bottom Drawer
  - Global Filter
- *Planning & Time*
  - Day Planning, Planning Ahead, Week Scheduler
  - Time Blocking
  - Duration estimates and time tracking
  - Work Session Scheduler
  - Calendar Sync
- *Focus & Habits*
  - Eat the Frog, driven by a "dread" level
  - Procrastination Count
  - This or That
  - Accountability Pledge
  - Super Focus Mode
  - Tomato (Pomodoro) timer
  - Habits, Trackers, Goals
  - Reward Tasks, Beat the Clock, Kudos
  - Energy levels
- *AI*
  - None native. There is a community MCP server ([mcpservers.org](https://mcpservers.org/servers/bgheneti/Amazing-Marvin-MCP)).
- *Platforms*
  - Web, Mac, Windows, iOS, Android ([pricing](https://amazingmarvin.com/pricing/))
- *Pricing*
  - Single "Pro" tier: **$8/mo billed annually ($96/yr)**, advertised as 33% off monthly, which implies about $12 monthly
  - 14-day trial, no card required
  - No free tier
  - 50% student discount

**Analysis**
- **Positioning:** The most customizable to-do app. Heavily adopted by people with ADHD and procrastinators.
- **Methodology:** Premade workflows for GTD, Eisenhower, Ivy Lee and others ([KB](https://help.amazingmarvin.com/en/collections/1139197-strategies)). Its GTD-specific strategies are the Missing Next Steps Warning and Task Hints.
- **Standout mechanic, "Strategies":** Every advanced feature is a toggleable module, over 100 features and 300+ settings, "only turn on what you need."
  - The base app is a simple list.
  - Users stack strategies to build a personal system, for example Eat the Frog plus Time Blocking plus Rewards.
  - This is the segment's clearest example of **user-driven progressive disclosure**.
- **Data ownership:** Cloud sync with offline-capable apps. No end-to-end encryption claim found.
- **Praise:** Unmatched customization, behavior-psychology tools (dread, rewards, pledge), daily planning ([Capterra](https://www.capterra.com/p/238806/Amazing-Marvin/reviews/), [G2](https://www.g2.com/products/amazing-marvin/reviews)).
- **Complaints:**
  - Overwhelming at first. "People who bounce off it tend to bounce hard, usually in the first week" ([saner.ai review](https://blog.saner.ai/amazing-marvin-review/)).
  - Clunky mobile app
  - No free tier
  - No notes space
  - No AI
- **Recent changes:** The public changelog ([community.amazingmarvin.com/changelog](https://community.amazingmarvin.com/changelog)) would not render, so **2025–26 changes are unverified.**

---

## 3. Nirvana (NirvanaHQ)

**Features**
- *Capture*
  - Email capture (included on the free plan)
  - Share-to-Nirvana (April 2026)
  - Paste as task
  - Home-screen widgets (April 2026)
- *Organize*
  - GTD lists: Inbox, Next, Waiting, Scheduled, Someday
  - Projects and Areas
  - Tags and contexts
  - Notes and checklists
  - Reference lists
  - Sequential or parallel projects and energy/time attributes (long-standing; **unverified 2026**)
- *Views*
  - Focus list
  - Area filter that scopes the whole UI
  - Tag filtering
- *Planning & Time*
  - Scheduled (tickler)
  - Recurring to-dos (Pro only)
  - Calendar events shown in Focus
- *Collaboration*
  - None
- *Integrations & API*
  - Alexa, IFTTT, Gmail, Google Calendar, Dropbox ([appmus](https://appmus.com/software/nirvana))
- *Platforms*
  - Web (focus.nirvanahq.com), iOS, Android, Mac, Windows
- *Pricing* ([pricing](https://nirvanahq.com/pricing))
  - Free: basic projects and areas
  - Pro: **$3/mo or $36/yr**, adds unlimited projects and areas and recurring tasks

**Analysis**
- **Positioning:** Faithful, low-cost, cross-platform GTD.
- **Model:** Deliberately flat. No custom query language and no automation.
  - Power comes from strict GTD buckets plus tag and area filters.
  - Weekly review is manual: there is no per-project review interval.
- **Praise:** Close adherence to GTD, minimal friction, cheap, works on every platform ([saner.ai GTD roundup](https://blog.saner.ai/best-gtd-apps/)).
- **Complaints:**
  - Mobile "feels more like a website," too many taps
  - Historically slow updates
  - Unresponsive support
  - Thin roadmap ([saner.ai](https://blog.saner.ai/best-gtd-apps/), [App Store reviews](https://apps.apple.com/us/app/nirvana-for-gtd/id1022913190))
- **Recent changes** ([changelog](https://www.nirvanahq.com/changelog)). Development has visibly re-accelerated:
  - 2025: Spanish (July) and French (August) localization, and web and desktop moved to a shared codebase
  - January 2026 (v3.16): Google/Apple sign-in, German
  - April 2026 (v3.17–3.18): share sheet, widgets
  - May 2026 (v3.19): drag-to-insert, multi-select, swipe-to-move

---

## 4. Everdo

**Features**
- *Capture*
  - Quick capture on every platform
  - Chrome extension for web capture (desktop 1.11.9, March 2026)
- *Organize*
  - Sequential and parallel projects that populate next actions automatically
  - Areas of responsibility
  - Tags and contexts
  - Energy and time filters
  - Notebooks for reference material and templates
  - Checklists
- *Views*
  - GTD lists: Inbox, Next, Waiting, Someday
  - Focus list for starred or urgent items
- *Planning & Time*
  - Scheduled dates
  - Reminders
  - Recurring tasks
- *AI*
  - "Export tasks in structured format for AI agents" ([everdo.net](https://everdo.net/))
- *Integrations & API*
  - Structured export
  - Chrome and Firefox extensions
- *Platforms*
  - Windows, macOS, Linux, iOS, Android
  - No web app
- *Pricing* ([pricing](https://everdo.net/pricing/))
  - Free: 5 projects and 2 areas, with LAN sync
  - Pro: **$99.99 one-time** covering all platforms
  - End-to-end encrypted cloud sync: **$1.66/mo** add-on

**Analysis**
- **Positioning:** Offline-first, privacy-first GTD with a buy-once license.
- **Data ownership:** Data stays on your devices.
  - Two sync options: free peer-to-peer LAN sync, which is effectively self-hosted, or paid end-to-end encrypted cloud sync.
  - This is the strongest data-ownership story among the dedicated GTD apps.
- **Praise:** Privacy, no subscription, native Linux, a responsive solo developer, an app that "gets GTD right" ([AlternativeTo](https://alternativeto.net/software/everdo/about/), [outlinersoftware](https://www.outlinersoftware.com/topics/viewt/8410/0/everdo-very-nice-cross-platform-gtd-app)).
- **Complaints:** Mobile clearly lags desktop; iOS only got dark mode in February 2026. No web app, no calendar integration, and a steep upfront price. These are inferred from the dev log and feature list; I found **little 2025–26 review data**.
- **Recent changes** ([dev log](https://everdo.net/docs/development-log/)):
  - October 2025: Android dark theme and redesign
  - January 2026: desktop 1.10.4
  - February 2026: iOS 1.9.3 dark mode; Android 15-minute background sync
  - March 2026: desktop 1.11.9 with the Chrome extension and sync UX improvements
  - May 2026: Android 1.10.0 bottom-sheet editor, "copy as markdown"

---

## 5. FacileThings

**Features**
- *Capture*
  - Mind Sweep (a guided brain dump)
  - Email capture
  - Mobile capture
- *Organize*
  - Stage-gated GTD flow: Capture → Clarify → Organize → Review → Engage
  - Projects, contexts, Waiting-for, Someday
  - Areas of focus, goals, purpose (the GTD horizons)
- *Views*
  - "Perspective" view aligning daily tasks with goals and areas
  - Activity statistics
- *Planning & Time*
  - Google and Outlook calendar integration
- *AI*
  - AI-assisted "Natural Project Planning" (OpenAI, only on click). Suggests actions, up to 2 subprojects, and ordering ([blog](https://facilethings.com/blog/en/new-facilethings-feature-ai-assisted-natural-project-planning))
- *Collaboration*
  - Delegation
  - Shared agendas
- *Integrations & API*
  - Evernote, OneDrive, Google Drive, Dropbox, Box
  - 5 GB reference storage
- *Platforms*
  - Web first, plus iOS and Android apps
- *Pricing* ([pricing](https://facilethings.com/pricing))
  - **$12/mo** monthly
  - $27 per quarter
  - $48 per 6 months
  - **$84/yr ($7/mo)**
  - 30-day trial

**Analysis**
- **Positioning:** A GTD coach in software. The app enforces the workflow rather than just offering lists.
- **Standout:** The weekly review is a guided wizard and items move through GTD stages, which suits people learning GTD. Its horizons of focus (areas, goals, purpose) are more explicit than any other app here.
- **Praise:** "The best software implementation of GTD so far," and the weekly review workflow ([G2](https://www.g2.com/products/facilethings/discuss), [AlternativeTo](https://alternativeto.net/software/facilethings/about)).
- **Complaints:** Price relative to Nirvana, a web-centric UX, and rigidity for people who aren't GTD purists. I found **limited 2025–26 review data**.
- **Recent changes:** The site is active (© 2026), but I could not verify any 2025–26 releases. The AI planner dates from November 2023.

---

## 6. Lunatask

**Features**
- *Capture*
  - Email integration
  - Browser integration
  - Mobile apps
- *Organize*
  - Areas of Life, each with its own workflow, e.g. list or "forgiving Kanban"
  - Goals
  - Notebooks with tags
  - Priority and estimate presets
  - Waiting status (the `W` shortcut)
- *Views*
  - Kanban
  - Eisenhower Matrix (Premium)
  - Must/Should/Want (Premium)
- *Planning & Time*
  - Automatic prioritization
  - Work-in-progress limits
  - Time blocking by dragging tasks onto the calendar
  - Task timers and Pomodoro
  - Google, Outlook, iCloud, Fastmail and CalDAV calendars
  - Join Zoom, Meet and Teams calls from the app
- *Focus & Habits*
  - Daily habits (weekly habits are Premium)
  - Mood and emotion tracker
  - Energy and stress trackers (Premium)
  - Journal tied to mood
- *Collaboration*
  - None
- *Integrations & API*
  - Public API (note update/delete endpoints added December 2025)
  - Zapier, with improvements planned for April 2026
  - Deep links
  - Personal CRM (Relationships) with reconnect rules
- *Platforms*
  - Windows, macOS, Linux, iOS, Android
- *Pricing* ([pricing](https://lunatask.app/pricing))
  - Free: 2 areas, 7 habits, 30 relationships
  - Premium: **$6/mo annual or $8/mo monthly**
  - **Lifetime $300**, desktop only
  - 50% education discount

**Analysis**
- **Positioning:** An end-to-end encrypted "life OS" combining tasks, habits, mood, journal and a personal CRM. Leans toward ADHD and wellbeing users.
- **Standout:**
  - Tasks, habits, mood, energy and journaling live in one encrypted store, so users can see mood next to productivity.
  - Each area can run its own workflow.
  - WIP limits and "forgiving" Kanban are designed to reduce guilt.
  - I **could not verify** the exact mechanics of automatic prioritization; the docs page did not load.
- **Data ownership:** End-to-end encrypted with XSalsa20/Curve25519/Poly1305, keys derived with argon2id, private key never leaves the device ([privacy docs](https://lunatask.app/docs/getting-started/privacy)).
  - A competitor, SealTask, claims task status, priority and dates are stored unencrypted ([SealTask](https://sealtask.com/compare/sealtask-vs-lunatask/)); treat that as unconfirmed.
- **Praise:** End-to-end encryption makes journaling feel safe. "Many features but no learning curve." A very responsive solo developer ([Medium review](https://medium.com/@danielasgharian/lunatask-review-the-simple-all-in-one-productivity-app-for-2026-0a44d1b629bf)).
- **Complaints:** The mobile experience comes up in "almost every review," and there is no collaboration or shared lists for partners.
- **Recent changes** ([releases](https://lunatask.app/releases)):
  - Lunatask 2: Relationships (a personal CRM)
  - v2.1.0: Markdown editor rewrite
  - December 2025: API endpoints
  - Early 2026: calendar integrations (CalDAV, iCloud, Fastmail) rewritten, notes search, new onboarding
  - July 10, 2026: mobile release with better notifications and performance

---

## 7. Obsidian (Tasks + Dataview + Bases)

**Features**
- *Capture*
  - Daily notes
  - Mobile share
  - Community capture plugins (QuickAdd, Templater; **unverified versions**)
- *Organize*
  - Tasks are Markdown checkboxes with fields: due, scheduled, start, created, done and cancelled dates, priority, recurrence
  - Custom statuses
  - Dependencies via `id`/`dependsOn` (Tasks 6.1.0+), filterable with `is blocked` and `is blocking` ([docs](https://publish.obsidian.md/tasks/Getting+Started/Task+Dependencies))
  - Tags and folders
- *Views*
  - Tasks query blocks: filter, sort, group by, limit, show tree
  - Column/board view with drag-and-drop (Tasks 8.4.0, August 2025)
  - Dataview DQL/JS dashboards
  - **Bases** core plugin (since v1.9, 2025): no-code table, card, list and map views over properties
- *AI*
  - Community plugins only
- *Collaboration*
  - Minimal. Shared vaults via Sync.
- *Integrations & API*
  - Plugin API
  - Datacore (beta, React-based)
- *Platforms*
  - Windows, macOS, Linux, iOS, Android
- *Pricing* ([pricing](https://obsidian.md/pricing))
  - App free
  - Sync **$4/mo annual or $5 monthly**, AES-256 end-to-end
  - Publish $8–10 per site per month
  - Catalyst $25
  - Commercial license $50/user/yr, **optional**

**Analysis**
- **Positioning:** Build-your-own task system inside a plain-Markdown knowledge base.
- **Query power:** Tasks has a readable query DSL. Dataview adds inline fields, a SQL-like language and JavaScript. Bases gives a no-code GUI over properties but **cannot aggregate inline tasks**, so power users run Bases plus Tasks or Dataview ([locul](https://locul.ai/blog/obsidian-bases-plugin)).
- **Risk:** Dataview is effectively in maintenance mode. Its successor, Datacore, is a beta that requires React ([Safi 2026](https://abdulkadersafi.com/blog/dataview-vs-datacore-vs-bases)).
- **Tasks 8.0 (May 2025):** JavaScript in queries is disabled by default, for security ([releases](https://github.com/obsidian-tasks-group/obsidian-tasks/releases)).
- **Review and automation:** DIY. Users build weekly-review templates and dashboards themselves.
- **Praise:** Local Markdown files you own, tasks linked to notes, near-unlimited flexibility.
- **Complaints:**
  - All assembly required
  - Fragile plugins and syntax drift (emoji vs. Dataview format)
  - No native reminders
  - Awkward mobile task entry
  - Lag on large vaults ([Safi](https://abdulkadersafi.com/blog/dataview-vs-datacore-vs-bases))

---

## 8. Logseq

**Features**
- *Capture*
  - Daily journal
  - iOS Capture tab with voice recording (database version, invite-only)
- *Organize*
  - Outliner with block references
  - Database version:
    - `#Task` node with Status (Todo, Doing, In Review, Done, Backlog, Canceled), Priority, Deadline and Scheduled properties
    - Repeating tasks
    - Typed properties
    - Tags-as-classes with inheritance ([db-version doc](https://github.com/logseq/docs/blob/master/db-version.md))
  - File version: NOW/LATER/TODO/DOING markers plus SCHEDULED/DEADLINE
- *Views*
  - Simple queries with a query builder
  - Advanced (Datalog) queries
  - Table/list views with grouping and filtering
- *Collaboration*
  - Real-time collaboration (RTC) sync, database version only (paid, invite-only, self-hostable)
- *Integrations & API*
  - Plugins
  - CLI with query support (May 2026)
  - **Markdown Mirror**, which writes a plain-Markdown copy to disk ([May 2026 update](https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020))
- *Platforms*
  - Desktop (Windows, macOS, Linux) and web
  - iOS: native database-version app, alpha/invite-only
  - Android: new app not yet open to testers
- *Pricing*
  - App free and open source
  - Sync price **not published**; early access currently goes to Open Collective sponsors

**Analysis**
- **Positioning:** Privacy-first, open-source outliner and journal for people who manage tasks where they write.
- **Big shift:** 2.0 Beta, the database version (2.0.1, released July 13, 2026), makes SQLite the source of truth. The file-based "Logseq OG" is maintenance-only ([kompozy](https://kompozy.io/news/logseq-2-0-db-version-beta)).
  - Export options are SQLite, EDN, and Markdown without block properties.
- **Praise:** Journal-first workflow, local and open source, queries embedded in notes.
- **Complaints:**
  - A years-long wait for the database version
  - Beta "can lose data" warnings
  - Losing hand-editable Markdown
  - Sync moving to a paid model
  - Weak mobile

---

## 9. Workflowy

**Features**
- *Capture*
  - Desktop Quick Add
  - Android Quick Capture widget
  - Firefox clipper
  - Readwise and Kindle import
- *Organize*
  - Infinitely nested nodes with zoom
  - To-do node type and completion
  - #tags and @mentions
  - Mirrors
  - Numbered lists
  - Tables (2025)
- *Views*
  - Boards
  - Search operators
  - Calendar/Today node
- *Planning & Time*
  - Dates with "Move to Date" and "Found Dates" that surface dates anywhere in the outline
  - Google Calendar sync (2026.04, released April 21, 2026)
- *AI*
  - Chat with Your Notes
  - AI Nodes
  - AI Actions ([2025 review](https://blog.workflowy.com/2025-year-in-review/))
- *Collaboration*
  - Shared nodes
- *Integrations & API*
  - Public API (2025)
  - PDF viewer
- *Platforms*
  - Web, desktop and mobile apps
- *Pricing* ([pricing](https://workflowy.com/pricing/))
  - Free: 100 nodes per month
  - Pro: **$6.99/mo annual or $8.99 monthly**
  - Data retained if Pro lapses

**Analysis**
- **Positioning:** Minimalist infinite outliner, increasingly used as a daily planner.
- **Task model:** Thin. No start/defer logic, no dependencies, no review intervals. Native recurring tasks were **unverified**.
- **Praise:** Speed, simplicity, zoom.
- **Complaints:** Not a real task manager, and the free tier is limited.
- **Recent changes:** 43 updates in 2025 ([blog](https://blog.workflowy.com/2025-year-in-review/)) and Google Calendar sync in April 2026 ([2026.04](https://blog.workflowy.com/2026-04/)). The direction is clearly toward outline-native daily planning.

---

## 10. Taskwarrior

**Features**
- *Capture*
  - `task add` on the command line with inline attributes
  - Hooks for importers
- *Organize*
  - Dotted project hierarchy (e.g. `Home.Garden`)
  - Tags, plus virtual tags such as +BLOCKED and +OVERDUE
  - Priority
  - Dependencies
  - Annotations
  - **User-Defined Attributes** (custom fields)
- *Views*
  - Fully configurable reports with filter expressions
  - Named contexts (saved filters)
  - Burndown, calendar and history reports
- *Planning & Time*
  - Date types: due, scheduled, wait (a hidden-until date), until (auto-expiry)
  - Recurrence
  - Time tracking via the companion Timewarrior tool
- *Integrations & API*
  - Hooks that run scripts on add or modify
  - TaskChampion library
  - Third-party UIs
- *Platforms*
  - CLI on Linux, macOS and Windows (WSL)
  - Mobile only through third-party apps
- *Pricing*
  - Free, open source

**Analysis**
- **Positioning:** The scriptable command-line power tool.
- **Standout: the urgency algorithm.** Every task gets a score that is a weighted sum of factors ([docs](https://taskwarrior.org/docs/urgency/)). Default weights:

  | Factor | Weight |
  |---|---|
  | +next tag | 15.0 |
  | Due date | 12.0 |
  | Blocking another task | 8.0 |
  | Priority H / M / L | 6.0 / 3.9 / 1.8 |
  | Scheduled | 5.0 |
  | Active | 4.0 |
  | Age | 2.0 |
  | Tags, annotations, project | 1.0 each |
  | Waiting | −3.0 |
  | Blocked | −5.0 |

  - The `next` report sorts by this score.
  - Users can change the weights, including per-UDA weights, and the docs advise keeping changes within about ±1.
- **Data ownership:** 3.0 (March 2024) moved storage to SQLite via TaskChampion. Sync is encrypted so server operators can't read tasks, using either a self-hosted TaskChampion server or S3/Google Cloud Storage ([sync docs](https://taskwarrior.org/docs/sync/)).
- **Releases** ([news](https://taskwarrior.org/news/)):
  - 3.4.0: March 12, 2025
  - 3.4.2: October 21, 2025
  - 3.5.0: August 16, 2026. According to GitHub, it adds hyphens in tags, **Git-based sync**, and faster dependency and burndown processing ([release](https://github.com/GothenburgBitFactory/taskwarrior/releases/tag/v3.5.0)). The GitHub summary showed a conflicting year, so these details are only partly verified.
- **Praise:** Speed, composability, urgency scoring, plain data.
- **Complaints:** Command line only, a learning curve, weak mobile, and the painful sync migration from the old taskd server in 3.0.

---

## 11. Emacs Org-mode (brief)

**Features**
- *Capture*
  - `org-capture` templates
  - Refile
- *Organize*
  - Custom TODO keyword sequences
  - Priorities
  - Inherited tags
  - Properties drawers
  - Effort estimates
  - Unlimited heading depth
- *Views*
  - Agenda with custom agenda commands (arbitrary filters)
  - Column view
- *Planning & Time*
  - SCHEDULED and DEADLINE dates
  - Clocking (time tracking)
  - Habits
  - Repeaters
- *Integrations & API*
  - Elisp (unlimited automation)
  - org-babel
- *Platforms*
  - Emacs everywhere
  - Mobile through third-party apps (Beorg, Orgzly Revived; **unverified details**)
- *Pricing*
  - Free (GPL)

**Analysis**
- **Current version:** 9.8, with 9.8.8 released July 25, 2026 ([orgmode.org](https://orgmode.org/Changes.html)).
- It is the ceiling for flexibility and plain-text ownership, but the Emacs requirement puts it out of reach for most users. It is the benchmark for "agenda as a query language."

---

## 12. Capacities and Tana (task features)

**Capacities**
- *Capture*
  - Tasks from any note
  - Command palette
  - Mobile
  - Raycast
  - WhatsApp, Telegram and email capture
- *Organize*
  - Task properties: status (Not started, Next Up, In progress, Done, plus custom), 4-level priority, scheduled date, deadline
  - Context links to projects and people
  - Recurrence: fixed schedule or after completion
- *Views*
  - Inbox, Today, Scheduled, Context, Tags, Open, Completed
  - Custom dashboard sections from saved queries, as list or Kanban
  - Tasks shown in Capacities' own calendar
- *Integrations & API*
  - "Task Actions" that send tasks to Todoist, Things, TickTick, Apple Reminders or Google Tasks
  - API
- *Platforms*
  - macOS, Windows, Linux, iOS, Android, Web
- *Pricing* ([pricing](https://capacities.io/pricing))
  - Basic: free (**no tasks**)
  - Pro: **$9.99/mo or $119.88/yr** (includes tasks)
  - Believer: $12.49/mo
  - AI add-on: $8.33/mo
- **Analysis:**
  - Tasks shipped December 9, 2025 under a "no setup required" pitch ([release 57](https://capacities.io/whats-new/release-57)).
  - Current limits ([docs](https://docs.capacities.io/reference/task-management)): no custom task properties, no reminders, no external calendar sync.
  - The Task Actions hand-off shows it positions tasks as *context capture*, not as a full task engine.

**Tana**
- **Company split, April 2026:**
  - tana.inc is now an "agentic meeting platform" with no offline support ("ETA unknown") and mobile "coming" ([tana.inc](https://tana.inc/)).
    - Pricing: Free; Pro **$20 early bird / $30**; Max **$80 early bird / $120** ([pricing](https://tana.inc/pricing)).
  - The original product moved to **Tana Outliner** at outliner.tana.inc ([outliner pricing](https://outliner.tana.inc/pricing)):
    - Free: 500 AI credits, supertags, tasks
    - Plus: **$8/mo or $62/yr**, 2,000 credits, Google Calendar sync
    - Pro: **$14/mo or $109.20/yr**, 5,000 credits, API
- **Task mechanics:** Tagging a node `#task` gives it fields (status, due, priority). Supertags inherit from one another and a node can carry several. Live searches act as saved views.
- **Complaints:** Supertags take "a few days to internalize" ([review](https://aishortcutlab.com/tools/tana/review)), it is cloud-only, and the pivot creates uncertainty for Outliner users.

---

## 13. Newer entrants worth watching (2024–26)

- **Super Productivity** ([GTD page](https://super-productivity.com/use-cases/gtd/))
  - Free and open source, offline-first
  - Optional sync via Dropbox or WebDAV
  - Web, desktop and mobile
  - Time tracking
  - Jira, GitHub and GitLab issue import
  - GTD inbox, projects and tags
  - The Reddit-favorite free option
- **tududi** ([tududi.com](https://tududi.com/))
  - Self-hosted and open source
  - Hierarchy of areas → projects → tasks → subtasks
  - **Ships an MCP server for AI agents**, an early example of "agent-readable task stores"
- **Lifestack** (AI auto-scheduling) is increasingly framed as an OmniFocus alternative ([lifestack](https://lifestack.ai/blog/omnifocus-alternatives)). It sits closer to the Motion/Sunsama segment.

---

## Segment-level takeaways

**Most valued power features**
1. **Computed availability.** Defer/start dates, sequential projects and waiting/blocked states hide work that isn't actionable. This is the core of OmniFocus, Everdo, Nirvana and Taskwarrior (wait, blocked), and Obsidian Tasks (`is not blocked`).
2. **Saved views over a strong filter model.** OmniFocus custom perspectives, Taskwarrior reports and contexts, Org agenda commands, Tasks/Dataview queries, Tana live searches. Loyalists stay for this more than anything else.
3. **Per-project review cadence.** OmniFocus review intervals and FacileThings' guided review. GTD users call the weekly review the make-or-break habit, and few apps support it well.
4. **Frictionless capture everywhere.** Email-in, share sheet, global hotkey, widgets, browser extension. Nirvana and Everdo added share sheets, widgets and a browser extension in 2026, which shows it is still table stakes.
5. **Data ownership.** Local-first storage, end-to-end encrypted sync, one-time pricing (Everdo, Lunatask lifetime, OmniFocus perpetual), and plain-text or Markdown export. The Logseq and Tana pivots made this more salient.

**What causes complexity and abandonment**
- **Setup cost before any value.** OmniFocus "weeks setting it up"; Marvin users "bounce hard in the first week."
- **Syntax-heavy DIY.** Dataview and Datalog queries, Obsidian's emoji vs. Dataview field formats, Taskwarrior and Org. There is also plugin-abandonment risk (Dataview in maintenance, Datacore in beta).
- **Paywalling the power layer.** OmniFocus Standard lacks perspectives, Focus and automation, and reviewers say it is hard to use comfortably without Pro.
- **Mobile parity gaps.** The most common complaint for Lunatask, Marvin, Nirvana, Everdo and Logseq.
- **Platform and architecture churn.** OmniFocus is Apple-only. Logseq's database migration carries data-loss warnings. Tana pivoted to meetings.
- **Tag and context sprawl, and review fatigue.** A standard GTD critique, **not verified** from 2025–26 sources here.

**How the best apps handle progressive disclosure**
- **Module toggles:** Marvin's Strategies. The base app is a plain list and each technique (frog, dependencies, time blocking, rewards) is opt-in and discoverable from a catalog.
- **Methodology presets:** Marvin's workflow library (GTD, Ivy Lee, Eisenhower). FacileThings bakes one method into the flow.
- **Per-area workflows:** Lunatask lets each life area be a list or a Kanban, with WIP limits.
- **Zero-config defaults with an escape hatch:** Capacities tasks ("it just works"), plus query sections for power users.
- **GUI builder over a text language:** Obsidian Bases over Dataview, and Logseq's query builder over Datalog. The winning pattern is a GUI that can round-trip to text.
- **Tiering:** OmniFocus Standard vs. Pro. This works as pricing but is resented as usability gating.

**Gaps and opportunities for Personal Work Management**
1. **OmniFocus-level depth off Apple.** Computed availability, sequential/parallel projects, perspectives, review intervals and Planned dates remain Apple-only. Windows, Android and web users settle for Nirvana or Everdo, which are simpler, or Marvin, which is complex in a different way.
2. **A modular engine plus methodology templates.** Ship a Marvin-style strategy toggle system with one-click presets (GTD, PARA, Eisenhower, Ivy Lee, Eat the Frog, time blocking). Each preset should enable only the modules it needs and include an in-context explainer.
3. **A query language with a visual builder that round-trips to text.** Nobody fully owns "Bases ease plus Tasks/Taskwarrior power." Add Taskwarrior-style computed urgency with user-visible, tunable weights ("why is this ranked #1?").
4. **A first-class guided review.** Per-project intervals, stale-project and missing-next-action detection (Marvin has a warning), and waiting-for follow-ups, all as a step-by-step wizard (FacileThings) rather than a raw list.
5. **AI as a clarifier, not a chatbot.** Turn inbox items into next actions and projects (FacileThings' planner is still manual-click and dates from 2023), suggest contexts and estimates, and draft weekly-review summaries.
   - Ship an **MCP server and API** from day one. OmniFocus is only "considering" MCP, Marvin relies on a community server, and tududi already ships one.
6. **Trust architecture.** Local-first storage with end-to-end encrypted sync, including metadata (a gap in Lunatask per the competitor claim above). Offer a Markdown/JSON "mirror" export (Logseq's 2026 move) and a one-time or lifetime option.
7. **Wellbeing signals feeding the planner.** Lunatask records energy, mood and habits, but its automatic prioritization is opaque. Using energy level plus estimate to pick "what now" (Everdo has energy and time filters; Marvin has energy levels) is under-exploited.
8. **Mobile parity and reminders.** This is the most repeated complaint across the segment and still unsolved. Capacities has no reminders; Obsidian has none natively.
