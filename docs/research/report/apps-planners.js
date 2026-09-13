// Segment 3 — daily planners & AI schedulers. Source: research/03-daily-planners-ai-schedulers.md (verified Sep 2026)
window.APPS = (window.APPS || []).concat([
  {
    name: "Sunsama", seg: "plan",
    tag: "Calm, ritual-driven daily planner for multi-tool knowledge workers",
    price: "$17/mo yr · $22 mo · no free plan", priceMo: 17,
    platforms: "Web, Mac, Windows, Linux, iOS, Android",
    f: {
      Capture: ["Sidebar pulls tasks from connected tools", "Slack message / email → task"],
      Organize: ["Channels (AI-assigned)", "Weekly objectives, backlog"],
      Views: ["Daily list/kanban beside calendar", "Week board"],
      Planning: ["Guided daily planning ritual", "Overload warning vs available hours", "Guided daily shutdown", "Weekly planning & review", "Drag tasks to calendar"],
      Focus: ["Focus mode, Pomodoro", "Break reminders"],
      AI: ["Time estimates learned from your history", "MCP server"],
      Integrations: ["Asana, Jira, Linear, Notion, Todoist, GitHub, Gmail, Outlook, Slack (2-way)", "Google, Outlook, Apple calendars"]
    },
    love: "Builds a planning habit; stops over-commitment; clean work/life line",
    hate: "Price, no free tier; mobile secondary; no auto-scheduling"
  },
  {
    name: "Motion", seg: "plan",
    tag: "Best-known AI auto-scheduler, now an 'agentic work suite' for SMBs",
    price: "Pro AI ~$12.73/mo yr ($19 mo) · Business AI $29", priceMo: 12.73,
    platforms: "Web, desktop, iOS, Android",
    f: {
      Capture: ["AI chat creates tasks & projects"],
      Organize: ["Projects, workspaces, docs, wiki"],
      Views: ["Calendar, list, kanban", "Gantt (Business)"],
      Planning: ["Auto-schedules by priority, deadline, duration", "Splits long tasks into chunks", "Reschedules missed work", "'Could not fit' warnings", "Booking links"],
      AI: ["AI Employees (autonomous agents)", "AI meeting notetaker", "Credit-metered usage"],
      Collab: ["Team capacity, dashboards (Business)"]
    },
    love: "Strongest auto-scheduling engine",
    hate: "Pricing churn, credits, billing friction, bloat"
  },
  {
    name: "Akiflow", seg: "plan",
    tag: "Keyboard-driven command centre that consolidates every inbox",
    price: "$19/mo yr · $34 mo", priceMo: 19,
    platforms: "Desktop, web, iOS, Android",
    f: {
      Capture: ["Universal inbox", "Global quick-capture shortcut", "Email, Slack, Teams, WhatsApp → task"],
      Organize: ["Labels, tags, lists", "Subtasks with progress"],
      Views: ["Inbox + calendar", "Mobile Daily Dashboard + Live Activity"],
      Planning: ["Drag to time-block", "Schedule Optimizer re-plans the rest of the day", "Availability sharing"],
      AI: ["Aki assistant: chat, auto-schedule, daily briefs", "Meeting Assistant → to-dos", "Hosted MCP"],
      Integrations: ["Asana, ClickUp, Notion, Todoist, Jira, Linear, Gmail, Slack, GitHub, Zapier"]
    },
    love: "Fast capture & consolidation; keyboard flow",
    hate: "Billing complaints; steep monthly price"
  },
  {
    name: "Reclaim", seg: "plan",
    tag: "AI layer on your calendar that defends focus time and habits (Dropbox)",
    price: "Free Lite · Starter $10/mo yr · Business $15", priceMo: 10,
    platforms: "Web only — no mobile app",
    f: {
      Planning: ["P1–P4 priority across tasks, habits, meetings", "Blocks flip Free → Busy as deadlines near", "Focus Time goals", "Flexible Habits", "Buffer time & breaks", "Auto-rescheduling", "Smart 1:1s, scheduling links"],
      AI: ["Framed as 'AI Agents'"],
      Views: ["Time analytics, Deep Work Index"],
      Integrations: ["Todoist, Asana, ClickUp, Jira, Linear, Google Tasks", "Google & Outlook calendars"]
    },
    love: "Best flexible habits; generous free tier",
    hate: "No mobile app; blocks move unexpectedly"
  },
  {
    name: "Morgen", seg: "plan",
    tag: "Unified calendar + AI planner that proposes but never auto-moves",
    price: "$15/mo yr · $30 mo", priceMo: 15,
    platforms: "Windows, Mac, Linux, iOS, Android, web, extension",
    f: {
      Capture: ["Native tasks + integration tasks", "Duration tags like [30m]"],
      Planning: ["AI Planner preview → 'Schedule all'", "Frames: ideal-week templates", "Missed tasks: ASAP / rearrange / leave", "Travel time, buffers, booking links"],
      Integrations: ["Notion, Todoist, Linear, ClickUp, Obsidian", "Google, Outlook, iCloud, Fastmail, Zoho calendars"]
    },
    love: "Broadest calendar support; approval-first control; Linux",
    hate: "AI hit-or-miss; Frames setup friction"
  },
  {
    name: "Amie", seg: "plan",
    tag: "Once the beautiful calendar + todo; now an AI meeting note-taker",
    price: "Free · Pro $20/mo yr", priceMo: 20,
    platforms: "Mac, Windows, iOS — no Android",
    f: {
      Planning: ["Calendar + to-dos in one", "Menu-bar calendar"],
      Focus: ["Pomodoro timer"],
      AI: ["Bot-free meeting notes", "Chat with notes, follow-up emails", "MCP access"],
      Integrations: ["HubSpot, Notion, Slack, Linear, Attio"]
    },
    love: "Design",
    hate: "Expensive now it's meeting-notes-first; crashes"
  },
  {
    name: "Structured", seg: "plan",
    tag: "Visual mobile-first day timeline; 15M+ downloads",
    price: "Free · Pro $9.99–49.99/yr · Lifetime $99.99", priceMo: 2.5,
    platforms: "iOS, Mac, Watch, Android, web",
    f: {
      Capture: ["Inbox", "Siri", "Photo of handwritten plan → tasks"],
      Organize: ["Colours, 300+ icons", "Subtasks, notes"],
      Views: ["Visual day timeline", "Week & month"],
      Planning: ["Drag to timeline", "Replan pushes missed tasks", "Calendar & Reminders import"],
      Focus: ["Pomodoro", "Energy Monitor", "Live Activities, widgets"],
      AI: ["Structured AI plans your day by chat"]
    },
    love: "Instant visual clarity; ADHD-friendly",
    hate: "iCloud sync unreliable; Android/web lag"
  },
  {
    name: "Tiimo", seg: "plan",
    tag: "Visual planner for neurodivergent users — iPhone App of the Year 2025",
    price: "Free (mobile) · Pro $79.99/yr", priceMo: 6.67,
    platforms: "iOS, iPad, Watch, Android, Mac, web",
    f: {
      Views: ["Colour/icon visual timeline", "Circular visual timer"],
      Planning: ["AI Co-Planner: thoughts → steps + estimates", "Routine templates, checklists", "Gentle reminders"],
      Focus: ["Focus timer", "Mood tracking, streaks", "Widgets, Live Activities, Watch"]
    },
    love: "Calm, inclusive design",
    hate: "Bugs: items disappear, notifications misfire"
  },
  {
    name: "Llama Life", seg: "plan",
    tag: "ADHD focus list — every task gets its own countdown",
    price: "$39/yr · 7-day trial", priceMo: 3.25,
    platforms: "Web, iOS, Android",
    f: {
      Planning: ["Per-task countdown timers", "Running finish-time estimate", "Routines & presets", "Not-Now list"],
      Focus: ["Confetti & celebrations"],
      AI: ["AI task breakdown"]
    },
    love: "Calming, gets you started",
    hate: "Preset management feels heavy"
  },
  {
    name: "Ellie Planner", seg: "plan",
    tag: "Solo-dev brain-dump + timebox planner in paper style",
    price: "Free · Pro $9.99/mo · Lifetime $299.99", priceMo: 8,
    platforms: "Mac, Windows, web, iPhone, iPad",
    f: {
      Capture: ["Brain dump", "Email forwarding, Siri"],
      Views: ["Endless kanban across dates", "Week calendar, today mode"],
      Planning: ["Timebox mode (drag to calendar)", "Rollover, routines"],
      Focus: ["Built-in time tracker, analytics"],
      Integrations: ["Google/Apple/Outlook calendars, Notion, Zapier"]
    },
    love: "Simple paper-planner feel",
    hate: "Free tier lacks timeboxing; no Android"
  },
  {
    name: "Tweek", seg: "plan",
    tag: "Minimalist paper-style weekly spread",
    price: "Free · Premium $49.99/yr", priceMo: 4.17,
    platforms: "iOS, Mac, web, Android",
    f: {
      Views: ["Weekly spread default", "Someday list"],
      Organize: ["Checklists, subtasks, colours"],
      Planning: ["2-way Google/Apple calendar sync", "Recurring tasks"]
    },
    love: "Simplicity",
    hate: "No hourly slots; no AI"
  },
  {
    name: "Saner.ai", seg: "plan",
    tag: "AI second brain & planner for ADHD knowledge workers",
    price: "Free · Starter $8 · Standard $16/mo", priceMo: 8,
    platforms: "Web, mobile, Chrome",
    f: {
      Capture: ["Brain dump → tasks", "Voice, Chrome extension"],
      Planning: ["One-click prioritize & schedule", "Proactive morning check-ins"],
      AI: ["Skai assistant", "Tasks extracted from notes & email", "Choice of GPT / Claude / Gemini"],
      Integrations: ["Gmail, Slack, Google Calendar, Drive, Outlook"]
    },
    love: "Proactive AI help",
    hate: "Independent reviews unverified"
  },
  {
    name: "Blitzit", seg: "plan",
    tag: "Todo list that collapses into a floating focus timer",
    price: "$4.99/mo yr · $6.99 mo", priceMo: 4.99,
    platforms: "Desktop; mobile in progress",
    f: {
      Focus: ["Floating always-on timer", "Blitz mode, Pomodoro", "Estimate vs actual time"],
      AI: ["Blitzy AI: voice & brain dump → tasks"],
      Integrations: ["Notion, ClickUp, Asana, Todoist, Trello, Linear, webhooks"]
    },
    love: "Focus-first flow",
    hate: "Mobile unfinished"
  }
]);
