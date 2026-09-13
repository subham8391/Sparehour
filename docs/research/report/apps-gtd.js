// Segment 2 — GTD & power-user apps. Source: research/02-gtd-power-user-apps.md (verified Sep 2026)
window.APPS = (window.APPS || []).concat([
  {
    name: "OmniFocus", seg: "gtd",
    tag: "The reference GTD engine for Apple power users",
    price: "Standard $74.99 · Pro $149.99 one-time · or $99.99/yr", priceMo: 8.33,
    platforms: "Mac, iPhone, iPad, Watch, Vision Pro, web add-on — no Android/Windows",
    f: {
      Capture: ["Quick Entry window", "Mail Drop email-to-inbox", "Share sheet, Siri, Shortcuts, Watch"],
      Organize: ["Parallel, sequential and single-action projects", "Folders, nested action groups", "Hierarchical tags as contexts", "Project status: active / on hold / dropped"],
      Views: ["Inbox, Projects, Tags, Forecast, Flagged, Review", "Custom perspectives with all/any/none rules (Pro)", "Focus mode narrows the database (Pro)"],
      Planning: ["Defer, Due and Planned dates", "Estimated duration", "Advanced repeats (from due / defer / fixed)", "Forecast with calendar overlay", "Per-project review intervals"],
      AI: ["Apple on-device models via plug-ins", "MCP under consideration"],
      Integrations: ["Omni Automation (JavaScript)", "AppleScript, URL scheme", "E2E-encrypted Omni Sync"]
    },
    love: "Perspectives depth, reliability, best weekly-review workflow",
    hate: "Weeks to set up; Pro paywall; $100/yr; Apple lock-in"
  },
  {
    name: "Amazing Marvin", seg: "gtd",
    tag: "The most customizable todo app — ADHD & procrastinator favourite",
    price: "Pro $8/mo yr (~$12 mo) · no free tier", priceMo: 8,
    platforms: "Web, Mac, Windows, iOS, Android",
    f: {
      Capture: ["Braindump, quick add", "Email-to-Marvin, API/Zapier"],
      Organize: ["Categories, projects, subtasks", "Labels as contexts", "Start/end dates, dependencies", "Backburner (someday)"],
      Views: ["Smart Lists, custom screens, dashboard", "Eisenhower Matrix", "Lists, boards, timelines"],
      Planning: ["Day planning, week scheduler", "Time blocking", "Estimates + time tracking", "Calendar sync"],
      Focus: ["100+ toggleable 'Strategies'", "Eat the Frog by dread level", "Procrastination count", "Pomodoro, habits, goals, rewards", "Energy levels"],
      AI: ["None native (community MCP)"]
    },
    love: "Unmatched customization; behaviour-psychology tools",
    hate: "Overwhelming week one; clunky mobile; no free tier"
  },
  {
    name: "Nirvana", seg: "gtd",
    tag: "Faithful, low-cost, cross-platform GTD",
    price: "Free · Pro $3/mo ($36/yr)", priceMo: 3,
    platforms: "Web, iOS, Android, Mac, Windows",
    f: {
      Capture: ["Email capture (free)", "Share sheet, widgets (2026)"],
      Organize: ["Inbox, Next, Waiting, Scheduled, Someday", "Projects and Areas", "Tags/contexts, energy & time", "Reference lists"],
      Views: ["Focus list", "Area filter scopes the whole UI"],
      Planning: ["Scheduled (tickler)", "Recurring (Pro)", "Calendar events in Focus"],
      Integrations: ["Alexa, IFTTT, Gmail, Google Calendar"]
    },
    love: "Pure GTD, minimal friction, cheap",
    hate: "Mobile feels like a website; historically slow updates"
  },
  {
    name: "Everdo", seg: "gtd",
    tag: "Offline-first, privacy-first GTD with a buy-once licence",
    price: "Free · Pro $99.99 one-time · E2E sync $1.66/mo", priceMo: 0,
    platforms: "Windows, Mac, Linux, iOS, Android — no web",
    f: {
      Capture: ["Quick capture everywhere", "Chrome extension (2026)"],
      Organize: ["Sequential/parallel projects auto-populate Next", "Areas, contexts, energy & time", "Notebooks for reference"],
      Views: ["Inbox, Next, Waiting, Someday, Focus"],
      Planning: ["Scheduled dates, reminders, recurrence"],
      AI: ["Structured export for AI agents"],
      Integrations: ["Free LAN peer-to-peer sync", "Paid E2E cloud sync"]
    },
    love: "Privacy, no subscription, native Linux",
    hate: "Mobile lags desktop; no calendar integration"
  },
  {
    name: "FacileThings", seg: "gtd",
    tag: "A GTD coach in software — the app enforces the workflow",
    price: "$12/mo · $84/yr", priceMo: 7,
    platforms: "Web, iOS, Android",
    f: {
      Capture: ["Guided Mind Sweep", "Email capture"],
      Organize: ["Stage-gated Capture → Clarify → Organize → Review → Engage", "Areas, goals, purpose (GTD horizons)"],
      Views: ["Perspective aligning tasks to goals", "Activity statistics"],
      Planning: ["Guided weekly-review wizard", "Google/Outlook calendar"],
      AI: ["AI project planning (on click)"],
      Collab: ["Delegation, shared agendas"]
    },
    love: "'Best software implementation of GTD'; guided review",
    hate: "Pricey vs Nirvana; rigid for non-purists"
  },
  {
    name: "Lunatask", seg: "gtd",
    tag: "E2E-encrypted life OS: tasks + habits + mood + journal + personal CRM",
    price: "Free · Premium $6/mo yr · Lifetime $300", priceMo: 6,
    platforms: "Windows, Mac, Linux, iOS, Android",
    f: {
      Capture: ["Email and browser integration"],
      Organize: ["Areas of Life with per-area workflow", "Goals, notebooks", "Waiting status"],
      Views: ["'Forgiving' Kanban with WIP limits", "Eisenhower, Must/Should/Want"],
      Planning: ["Automatic prioritization", "Time blocking on calendar", "CalDAV, iCloud, Google, Outlook"],
      Focus: ["Pomodoro, task timers", "Habits", "Mood, energy & stress tracking", "Journal"],
      Integrations: ["Public API, Zapier", "Relationships (personal CRM)"]
    },
    love: "E2E makes journaling safe; many features, low learning curve",
    hate: "Mobile in 'almost every review'; no sharing"
  },
  {
    name: "Obsidian + Tasks", seg: "gtd",
    tag: "Build-your-own task system inside plain Markdown notes",
    price: "App free · Sync $4/mo yr", priceMo: 0,
    platforms: "Windows, Mac, Linux, iOS, Android",
    f: {
      Capture: ["Daily notes", "QuickAdd / Templater plugins"],
      Organize: ["Markdown checkboxes with due/scheduled/start dates", "Priority, recurrence, custom statuses", "Dependencies (id / dependsOn)"],
      Views: ["Tasks query blocks (filter, group, sort)", "Board view (2025)", "Dataview dashboards", "Bases no-code tables"],
      AI: ["Community plugins only"],
      Integrations: ["Plugin API", "Local files you own", "AES-256 E2E Sync"]
    },
    love: "Local Markdown, tasks linked to notes, near-unlimited flexibility",
    hate: "All assembly required; no native reminders; fragile plugins"
  },
  {
    name: "Logseq", seg: "gtd",
    tag: "Open-source outliner & journal; tasks where you write",
    price: "Free · sync pricing unpublished", priceMo: 0,
    platforms: "Desktop, web; mobile DB app in alpha",
    f: {
      Capture: ["Daily journal", "iOS voice capture (DB beta)"],
      Organize: ["#Task with status, priority, deadline, scheduled", "Repeating tasks", "Typed properties, tag inheritance"],
      Views: ["Query builder + Datalog queries", "Tables with grouping"],
      Collab: ["Real-time collaboration (DB version)"],
      Integrations: ["Plugins, CLI", "Markdown Mirror export"]
    },
    love: "Journal-first, local, open source",
    hate: "Years-long DB migration; beta data-loss warnings; weak mobile"
  },
  {
    name: "Workflowy", seg: "gtd",
    tag: "Minimalist infinite outliner, drifting toward daily planning",
    price: "Free (100 nodes/mo) · Pro $6.99/mo yr", priceMo: 6.99,
    platforms: "Web, desktop, mobile",
    f: {
      Capture: ["Quick Add, widget, clipper"],
      Organize: ["Infinite nesting with zoom", "Mirrors, #tags, @mentions", "Tables (2025)"],
      Views: ["Boards, search operators", "Calendar / Today node"],
      Planning: ["Found Dates, Move to Date", "Google Calendar sync (2026)"],
      AI: ["Chat with notes, AI Nodes, AI Actions"],
      Integrations: ["Public API"]
    },
    love: "Speed, simplicity, zoom",
    hate: "Not a real task manager"
  },
  {
    name: "Taskwarrior", seg: "gtd",
    tag: "The scriptable command-line power tool",
    price: "Free, open source", priceMo: 0,
    platforms: "CLI on Linux, Mac, Windows (WSL)",
    f: {
      Capture: ["task add with inline attributes"],
      Organize: ["Dotted project hierarchy", "Tags + virtual tags (+BLOCKED, +OVERDUE)", "Dependencies, annotations", "User-Defined Attributes"],
      Views: ["Configurable reports & filter expressions", "Named contexts", "Burndown, calendar"],
      Planning: ["due, scheduled, wait, until dates", "Urgency score with tunable weights"],
      Integrations: ["Hooks on add/modify", "Encrypted self-hosted or cloud sync", "Timewarrior time tracking"]
    },
    love: "Speed, composability, urgency scoring",
    hate: "CLI only; weak mobile; sync migration pain"
  },
  {
    name: "Org-mode", seg: "gtd",
    tag: "Plain-text ceiling for flexibility — requires Emacs",
    price: "Free (GPL)", priceMo: 0,
    platforms: "Emacs everywhere; third-party mobile",
    f: {
      Capture: ["org-capture templates, refile"],
      Organize: ["Custom TODO keyword sequences", "Inherited tags, properties, effort", "Unlimited heading depth"],
      Views: ["Agenda with custom commands", "Column view"],
      Planning: ["SCHEDULED / DEADLINE", "Clocking (time tracking)", "Habits, repeaters"],
      Integrations: ["Elisp automation, org-babel"]
    },
    love: "Total ownership and power",
    hate: "Emacs barrier"
  },
  {
    name: "Capacities / Tana", seg: "gtd",
    tag: "Object-based note apps with task layers",
    price: "Capacities Pro $9.99/mo · Tana Outliner $8–14/mo", priceMo: 9.99,
    platforms: "All desktop + mobile + web",
    f: {
      Capture: ["Tasks from any note", "WhatsApp, Telegram, email capture (Capacities)"],
      Organize: ["Status, 4-level priority, scheduled, deadline", "Tana supertags with fields & inheritance"],
      Views: ["Inbox, Today, Scheduled", "Saved-query dashboards, Kanban", "Tana live searches"],
      Planning: ["Recurrence", "Google Calendar sync (Tana Plus)"],
      AI: ["Tana AI credits"],
      Integrations: ["Send tasks to Todoist/Things/TickTick (Capacities)"]
    },
    love: "Tasks linked to context and people",
    hate: "No reminders (Capacities); Tana pivot to meetings"
  }
]);
