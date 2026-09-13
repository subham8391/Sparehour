// Segment 4 — workspaces & PM tools used for personal work. Source: research/04-workspaces-pm-tools.md (verified Sep 2026)
window.APPS = (window.APPS || []).concat([
  {
    name: "Notion", seg: "work",
    tag: "Tasks living in the same databases as notes, projects and wikis",
    price: "Free · Plus $8/mo yr · Business $16 (for full AI)", priceMo: 8,
    platforms: "Web, Mac, Windows, iOS, Android; partial offline",
    f: {
      Capture: ["Web clipper, / commands", "Voice dictation in Agent", "AI Meeting Notes"],
      Organize: ["Databases: properties, relations, rollups, formulas", "Sub-items, repeating templates", "Buttons, forms"],
      Views: ["Table, board, list, calendar, timeline, gallery, chart, form"],
      Planning: ["@remind reminders", "Free Notion Calendar (Google/iCloud/Outlook)", "No native time tracking"],
      AI: ["Notion Agent: 20-min multi-step jobs", "Custom Agents on schedules/triggers", "AI Autofill for properties", "Hosted MCP server"],
      Collab: ["Real-time editing, comments, guests"],
      Integrations: ["Public API", "Database automations (Plus+)"]
    },
    love: "Flexible data model; docs + tasks together; templates",
    hate: "Laggy on mobile/big DBs; can't see future recurrences; AI paywalled"
  },
  {
    name: "ClickUp", seg: "work",
    tag: "One tool with every view, time tracking, goals and docs",
    price: "Free · Unlimited $7/mo yr · AI add-on $9–28", priceMo: 7,
    platforms: "Web, Mac, Windows, Linux, iOS, Android",
    f: {
      Capture: ["Quick-create, Inbox & Drafts", "AI Notetaker → action items"],
      Organize: ["Space → Folder → List → Task → Subtask", "Custom statuses & fields", "Dependencies, templates, private lists"],
      Views: ["List, Board, Calendar, Gantt, Table, Timeline", "Workload, Mind Map, Whiteboard", "Dashboards"],
      Planning: ["AI Planner auto time-blocks", "Native time tracking, Goals", "Reminders, recurring"],
      AI: ["Brain (GPT/Claude/Gemini)", "Super Agents you can @mention or assign", "Hosted MCP server"],
      Collab: ["Chat tied to tasks, whiteboards"],
      Integrations: ["Public API, ~1,000 integrations"]
    },
    love: "Unmatched view breadth; generous free plan; time tracking",
    hate: "Overwhelming UI; sluggish; AI add-on doubles the bill"
  },
  {
    name: "Asana", seg: "work",
    tag: "Polished team tool whose My Tasks is a strong personal view",
    price: "Personal free (2 users) · Starter $10.99/mo yr", priceMo: 10.99,
    platforms: "Web, Mac, Windows, iOS, Android",
    f: {
      Capture: ["Quick add, email-to-task", "AI Connectors from Claude/ChatGPT"],
      Organize: ["Tasks, subtasks, sections", "Multi-homing (one task, many projects)", "Custom fields & rules (Starter+)"],
      Views: ["List, board, calendar (free)", "Timeline, dashboards (Starter)"],
      Planning: ["My Tasks, Inbox", "Goals (Advanced)"],
      AI: ["AI Studio", "AI Teammates add-on", "Hosted MCP server"],
      Integrations: ["100+ integrations, REST API"]
    },
    love: "My Tasks & Inbox polish; reliable",
    hate: "Heavy hierarchy for solo use; free plan thin"
  },
  {
    name: "Trello", seg: "work",
    tag: "Boards everyone understands, pivoting to personal productivity",
    price: "Free · Standard $5/mo yr · Premium $10", priceMo: 5,
    platforms: "Web, Mac, Windows, iOS, Android",
    f: {
      Capture: ["Personal Inbox: email, Slack, Teams, Siri", "AI parses dates from captured text"],
      Organize: ["Boards, lists, cards, checklists", "Card mirroring, custom fields", "Butler automation"],
      Views: ["Board (free)", "Calendar, Timeline, Table, Dashboard (Premium)"],
      Planning: ["Planner: drag cards onto calendar", "AI focus-time blocks"],
      AI: ["7 AI features on paid plans", "MCP connection"],
      Integrations: ["Power-Ups, REST API, webhooks"]
    },
    love: "Instantly understandable; Inbox + Planner loop",
    hate: "Inbox/Planner shallow; 10-board free cap; weak recurring"
  },
  {
    name: "Linear", seg: "work",
    tag: "The speed and keyboard benchmark for work software",
    price: "Free (250 issues) · Basic $10/user", priceMo: 10,
    platforms: "Web, Mac, Windows, iOS, Android",
    f: {
      Capture: ["C creates issue anywhere", "Email-to-issue, Slack", "Triage inbox"],
      Organize: ["Issues, sub-issues, projects, initiatives", "Custom statuses, labels, priority, estimates", "Blocks / blocked-by relations", "Recurring issues"],
      Views: ["List, board, timeline/roadmap", "Saved filtered views"],
      Planning: ["Cycles as weekly timeboxes", "NL reminders (H → 'next Tuesday')", "Snooze, Pulse summaries"],
      AI: ["Linear Agent on all plans", "Delegate issues to agents", "Loops: recurring agent workflows", "Hosted MCP server"],
      Integrations: ["GraphQL API, webhooks, GitHub/GitLab"]
    },
    love: "Local-first <50ms UI; Cmd+K; single-key edits",
    hate: "Issue ceremony for small tasks; companion-grade mobile"
  },
  {
    name: "Taskade", seg: "work",
    tag: "Outlines + mind maps + AI agents, flat workspace pricing",
    price: "Free · Pro $10/mo yr (10 users)", priceMo: 10,
    platforms: "Web, Mac, Windows, iOS, Android",
    f: {
      Capture: ["Generate whole projects from a prompt"],
      Organize: ["Hierarchical outline projects", "500+ templates"],
      Views: ["List, board, table, calendar, mind map, org chart, Gantt"],
      AI: ["24/7 agents trained on your files", "Automations with branches", "Genesis prompt-to-app builder"],
      Collab: ["Real-time editing, chat"]
    },
    love: "Most AI per dollar; flat pricing",
    hate: "App-builder pivot dilutes tasks; confusing credits"
  },
  {
    name: "monday.com", seg: "work",
    tag: "Visual team boards and dashboards",
    price: "Basic $9/seat, 3-seat minimum ($27+)", priceMo: 27,
    platforms: "Web, desktop, iOS, Android",
    f: {
      Organize: ["Boards with typed columns", "Subitems, dependencies, forms"],
      Views: ["Table, Kanban", "Timeline, Gantt, Calendar (Standard+)", "My Work aggregate"],
      AI: ["Sidekick assistant, AI agents", "Credit-metered", "Official MCP"],
      Integrations: ["Automations (250–25K/mo)"]
    },
    love: "Dashboards, automations",
    hate: "Poor personal fit: seat minimum, team framing"
  },
  {
    name: "Microsoft Planner", seg: "work",
    tag: "Microsoft 365 default merging To Do + Planner + Project",
    price: "Basic with M365 · Plan 1 $10/user", priceMo: 10,
    platforms: "Web, Teams, mobile",
    f: {
      Views: ["Grid, Board, Schedule, Charts", "Timeline/Gantt (Premium)"],
      Planning: ["My Tasks, My Day (clears nightly)", "Goals, sprints (Premium)"],
      AI: ["Planner Agent (needs Copilot licence)"]
    },
    love: "Free for M365 users; daily-reset pattern",
    hate: "Fragmented across apps; AI costs extra"
  },
  {
    name: "Airtable / Superhuman Docs", seg: "work",
    tag: "Relational databases and doc-apps (Coda became Superhuman Docs Jul 2026)",
    price: "Airtable Team $20/mo yr · Docs Pro ~$12", priceMo: 12,
    platforms: "Web, desktop, mobile",
    f: {
      Organize: ["Linked records, formulas, rollups", "Docs with tables, buttons, Packs"],
      Views: ["Grid, kanban, calendar, gallery, timeline, form"],
      AI: ["Omni builder, field agents", "Docs AI + MCP"]
    },
    love: "Structured-data power",
    hate: "Weak as a todo app: no reminders or Today; rebrand risk"
  },
  {
    name: "Jira", seg: "work",
    tag: "Developer issue tracker; occasionally used for side projects",
    price: "Free (10 users) · Standard ~$7.91", priceMo: 7.91,
    platforms: "Web, desktop, mobile",
    f: {
      Organize: ["Issues with custom workflows", "JQL query language"],
      Views: ["Boards, sprints, backlogs"],
      AI: ["Rovo on paid plans"]
    },
    love: "Power for dev work",
    hate: "Overkill; heavy config, slow UI"
  },
  {
    name: "Height (shut down)", seg: "work",
    tag: "AI 'autonomous PM' — went offline Sep 24 2025, data deleted",
    price: "Discontinued", priceMo: null,
    platforms: "—",
    f: {
      AI: ["AI triage, backlog pruning, auto-updating specs (historical)"]
    },
    love: "—",
    hate: "Being AI-native wasn't enough; users lost data"
  }
]);
