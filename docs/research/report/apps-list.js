// Segment 1 — mainstream list-based todo apps. Source: research/01-list-based-todo-apps.md (verified Sep 2026)
window.APPS = (window.APPS || []).concat([
  {
    name: "Todoist", seg: "list",
    tag: "Default cross-platform power-user task manager, solo to small team",
    price: "Free · Pro $5/mo yr ($7 mo) · Business $8/user", priceMo: 5,
    platforms: "Web, iOS, Android, Mac, Windows, Linux, Watch, Wear OS, extensions, CLI",
    f: {
      Capture: ["Natural-language Quick Add (#project @label p1–p4)", "{ deadline shortcut", "!urgent! alarms through DND", "Ramble voice → structured tasks (38 languages)", "Task Capture from text/images", "Email forwarding, browser extensions"],
      Organize: ["Projects → sections → 4 levels of sub-tasks", "Labels, 4 priorities", "Separate Deadline field", "Task duration (Pro)", "Templates", "No start dates, custom fields or dependencies"],
      Views: ["List, Board, Calendar layout (Pro)", "Today & Upcoming", "Filter views with boolean query language", "Calendar colouring by priority/project/label"],
      Planning: ["Google Calendar sync + time blocks", "Custom & location reminders", "Completion-based repeats (every!)"],
      Focus: ["Karma points, streaks, daily/weekly goals", "Insights reports (Pro)"],
      AI: ["Ramble voice capture", "Task Assist, Email Assist", "Hosted MCP server"],
      Collab: ["Shared projects, assignees, comments", "Team workspaces, People workload tab"],
      Integrations: ["REST API v1 + OpenAPI, webhooks", "Python/TS SDKs, official td CLI", "80–90+ integrations"]
    },
    love: "Best quick-add in the segment; identical on every platform; ecosystem depth",
    hate: "5-project free cap; Dec 2025 price rise; no start dates; AI feels behind"
  },
  {
    name: "TickTick", seg: "list",
    tag: "All-in-one personal planner — tasks, calendar, habits, Pomodoro — for cheap",
    price: "Free · Premium $49.99/yr", priceMo: 4.17,
    platforms: "Web, iOS, Android, Mac, Windows, Linux, Watch, extensions",
    f: {
      Capture: ["Natural-language dates (free)", "Voice AI Mode: splits one utterance into many tasks", "AI voice-note transcription", "Widgets, email-to-task"],
      Organize: ["Folders → lists", "Multilevel nested tasks, checklists", "Tags, priorities, duration", "Custom smart lists", "Countdowns"],
      Views: ["List, Kanban", "Timeline / Gantt (Premium)", "Calendar day/week/month/year + heatmap", "Eisenhower Matrix"],
      Planning: ["Calendar subscriptions, Google Calendar", "Location reminders", "Constant Reminder nags until done", "Daily review prompt", "Suggested Tasks for today"],
      Focus: ["Pomodoro / focus timer with stats", "Habit tracker with stats", "White noise"],
      AI: ["AI Mode voice input", "Suggested Tasks from your patterns", "Hosted MCP server"],
      Collab: ["Shared lists with assignment"],
      Integrations: ["Open API (OAuth), MCP", "Notion", "No webhooks"]
    },
    love: "Most features for the money; tasks + calendar + habits + focus in one app",
    hate: "Overwhelming for newcomers; sync glitches; billing/cancellation complaints"
  },
  {
    name: "Things 3", seg: "list",
    tag: "Calm, design-led task manager for solo Apple users; buy once",
    price: "One-time: Mac $49.99, iPhone $9.99, iPad $19.99", priceMo: 0,
    platforms: "Mac, iPhone, iPad, Watch, Vision Pro — no web/Windows/Android",
    f: {
      Capture: ["Global Quick Entry with natural-language dates", "Magic Plus drag-to-insert", "Mail to Things, Siri, Shortcuts", "Widgets, Control Center, Spotlight"],
      Organize: ["Areas → Projects → Headings → To-dos → Checklists", "Tags", "When (start) date + Deadline", "This Evening, Someday, Logbook", "No priorities or custom fields"],
      Views: ["Inbox, Today, Upcoming, Anytime, Someday", "Calendar events inside Today", "Quick Find with tag filters", "Multiple windows"],
      Planning: ["Time-based reminders", "Repeating to-dos (early completion since Aug 2026)"],
      AI: ["None beyond Apple Writing Tools"],
      Integrations: ["Shortcuts, URL scheme, AppleScript", "No web API, no MCP"]
    },
    love: "Design, speed, Today/Someday model, start vs deadline, no subscription",
    hate: "Apple-only; no collaboration, AI or integrations; basic recurrence"
  },
  {
    name: "Microsoft To Do", seg: "list",
    tag: "Free Wunderlist successor; personal task layer of Microsoft 365",
    price: "Free", priceMo: 0,
    platforms: "Windows, Mac, iOS, Android, web",
    f: {
      Capture: ["Flagged Outlook emails → tasks", "Tasks from Outlook & Teams"],
      Organize: ["Lists and list groups", "Steps (one level of subtasks)", "Importance star, categories, notes, 25 MB attachments"],
      Views: ["My Day (clears nightly)", "Important, Planned, Assigned to Me, Flagged email"],
      Planning: ["Due dates, reminders, recurrence", "My Day suggestions"],
      AI: ["None in app — Microsoft puts AI into Copilot/Planner"],
      Collab: ["Shared lists, assign to members"],
      Integrations: ["Microsoft Graph To Do API", "Power Automate"]
    },
    love: "Free, clean, Outlook integration, My Day ritual",
    hate: "Maintenance mode; unreliable notifications; one level of steps"
  },
  {
    name: "Any.do", seg: "list",
    tag: "Consumer & family planner — tasks, calendar, WhatsApp reminders",
    price: "Free · Premium $4.99/mo yr ($7.99 mo) · Family $8.33", priceMo: 4.99,
    platforms: "Web, iOS, Android, Mac, Windows, Watch, Wear OS, extensions",
    f: {
      Capture: ["Natural-language + voice input", "WhatsApp task creation (Premium)", "Browser extensions, widgets"],
      Organize: ["Lists, subtasks, colour tags", "Recurring tasks (Premium only)"],
      Views: ["My Day planner", "Unified tasks + calendar", "Boards; Gantt in Teams tier"],
      Planning: ["Two-way Google Calendar", "Location reminders (Premium)", "Guided morning 'Moment' review"],
      AI: ["AI Assistant", "Break It Down into subtasks", "Clearer task-name suggestions"],
      Collab: ["Shared lists & boards, in-task chat", "Grocery lists grouped by aisle", "Family plan (4 members)"],
      Integrations: ["Zapier, Slack, Gmail, Teams, Zoom"]
    },
    love: "Easy, calendar + tasks together, Plan My Day, WhatsApp",
    hate: "Basics paywalled (recurring, location, tags); shallow projects"
  },
  {
    name: "Google Tasks", seg: "list",
    tag: "Free, minimal tasks inside Gmail, Calendar and Workspace",
    price: "Free", priceMo: 0,
    platforms: "Web + Workspace side panels, Android, iOS — no desktop app",
    f: {
      Capture: ["Email → task with link back", "Tasks from Chat messages", "Gemini can add/edit tasks"],
      Organize: ["Lists, one level of subtasks", "Due date/time, recurrence", "Deadlines (Nov 2025, date only)"],
      Views: ["Per-list views, sort by deadline", "Calendar side panel", "tasks.google.com"],
      Planning: ["'Block time for a task' in Google Calendar with Do Not Disturb"],
      AI: ["Gemini cross-app only"],
      Integrations: ["Google Tasks API"]
    },
    love: "Free and already where Gmail users live",
    hate: "No priorities, labels, sharing, rich notes or deep subtasks"
  },
  {
    name: "Apple Reminders", seg: "list",
    tag: "Free Apple default, gaining AI and power features every OS release",
    price: "Free", priceMo: 0,
    platforms: "iPhone, iPad, Mac, Watch, limited iCloud web",
    f: {
      Capture: ["Siri, share sheet, widgets", "Control Center / Action Button / Lock Screen", "Suggested Reminders from email, web, Messages", "Plain-language entry (iOS 27)"],
      Organize: ["Lists and sections; AI Auto-Categorize", "Tags, flags, priority, subtasks", "Grocery auto-sort", "No start dates"],
      Views: ["Smart lists (Today, Scheduled, Flagged, custom)", "Column / kanban view"],
      Planning: ["Time & location reminders", "Urgent alarms that break through", "Early reminders"],
      AI: ["Auto-Categorize, Suggested Reminders, natural-language entry"],
      Collab: ["Shared lists with assignment"],
      Integrations: ["EventKit, Shortcuts, CalDAV", "E2E with Advanced Data Protection"]
    },
    love: "Free, deeply integrated, now genuinely capable",
    hate: "No start dates; weak web; no Android/Windows"
  },
  {
    name: "Superlist", seg: "list",
    tag: "Lists + notes from the Wunderlist founders; meetings → tasks AI",
    price: "Free · Basic $5/mo · Super $21/mo", priceMo: 5,
    platforms: "Mac, iOS, Android, web; works offline",
    f: {
      Capture: ["Talk voice AI with preview", "Capture from Gmail & Slack", "AI meeting notes → tasks (no bot)"],
      Organize: ["Infinitely nested lists/subtasks", "Notes inside tasks", "Tags, due dates, weekday recurrence", "Activity log, bulk select"],
      Views: ["Today with Google Calendar meetings", "Activity heatmap", "No calendar view"],
      Planning: ["Google Calendar sync (first occurrence only for repeats)"],
      AI: ["Meeting transcription & summaries", "Chat with past meetings", "Email/Slack summarization", "MCP server"],
      Collab: ["Shared lists, assignment"],
      Integrations: ["Gmail, Slack, Linear, GitHub, Google Calendar"]
    },
    love: "Beautiful design, flexible nesting",
    hate: "Upgrade prompts everywhere; feels unfinished; sync bugs"
  },
  {
    name: "Remember The Milk", seg: "list",
    tag: "20-year veteran for power users — Smart Add, smart lists, scripting",
    price: "Free · Pro $49.99/yr", priceMo: 4.17,
    platforms: "Web, iOS, Android, Watch (Pro), desktop",
    f: {
      Capture: ["Smart Add: #tag @location *repeat =estimate +contact", "Email-to-task, Gmail add-on"],
      Organize: ["Lists, tags, priorities", "Start & due dates, estimates, locations", "Subtasks (Pro only)"],
      Views: ["Smart lists from search queries", "Advanced sorting (Pro)"],
      Planning: ["Reminders by email, SMS, IM, push", "Google Calendar, Outlook sync"],
      AI: ["MCP server (beta, Pro)"],
      Collab: ["Share with 2 free, unlimited on Pro"],
      Integrations: ["MilkScript automation (Pro)", "Zapier, JSON/CSV export"]
    },
    love: "Powerful search-based smart lists and syntax",
    hate: "Subtasks paywalled; dated feel"
  },
  {
    name: "NewTwos (Twos)", seg: "list",
    tag: "Notes-first 'write things down' daily lists, rebuilt with AI",
    price: "Free · Plus $39.99/yr · Lifetime $199", priceMo: 3.33,
    platforms: "Web, iOS, Android, Mac, Windows, Linux, Watch, extensions",
    f: {
      Capture: ["Auto date detection", "WhatsApp, email, text capture", "ChatGPT app"],
      Organize: ["Daily lists that roll over", "Topic lists, sub-items, tags"],
      Views: ["Timeline with drag-to-time-block", "Map, memory, 'things' views"],
      Planning: ["Location reminders", "Apple Reminders & calendar integration"],
      Focus: ["Streaks, focus mode"],
      AI: ["Chat & search over notes", "Next-action suggestions"]
    },
    love: "Frictionless capture",
    hate: "Tiny user base; odd sub-item behaviour; no rich text"
  },
  {
    name: "2Do", seg: "list",
    tag: "Indie power-user app with total control over where data syncs",
    price: "One-time: Mac $49.99, iOS $9.99", priceMo: 0,
    platforms: "Mac, iOS, Android",
    f: {
      Capture: ["Natural-language input", "Global Quick Entry", "Mail-to-2Do"],
      Organize: ["Lists, projects, checklists", "Tags, smart lists, pause a task", "Password-protected lists", "Batch editing"],
      Views: ["Multiple windows, focus mode", "'Nearby' location panel"],
      Planning: ["Multiple alerts per task", "Location reminders, flexible repeats"],
      AI: ["On-device auto-prioritization (iOS)"],
      Integrations: ["Sync via Dropbox, iCloud, CalDAV, Todoist, local Wi-Fi"]
    },
    love: "Privacy and sync choice; no subscription",
    hate: "Small indie cadence"
  }
]);
