# Mainstream list-based todo apps: competitive research (as of 2026-09-13)

**How to read this.** I checked pricing and 2025–26 claims against official pages, changelogs and 2025–26 reviews. Items marked **†** are long-standing features I could not re-check this session and are stated from product knowledge. The session hit its 200-search limit near the end, so a few details were checked only through WebFetch or not at all. Those are flagged.

---

## 1. Todoist
**Positioning:** The default cross-platform power-user task manager, scaling from one person to small teams.

**Features**
- **Capture**
  - Natural-language Quick Add: dates, recurrence, `#project`, `@label`, `p1–p4`†
  - Deadline shortcut: type `{` to get suggested deadline dates (June 2026) ([changelog](https://www.todoist.com/help/articles/2026-changelog-HD3jJAtLd))
  - Urgent reminders from Quick Add, e.g. `5pm !10mb!`. They ring as a full-screen alarm through Silent/DND and on Apple Watch (iOS preview, 2026)
  - Ramble: speak and get structured tasks with dates, priorities, projects and assignees. Web, iOS, Android, plus a Wear OS beta
  - Task Capture: pulls tasks out of text or images, with an editable preview (March 2026)
  - Email Assist (Pro); email forwarding into projects†; browser extensions and email add-ons
- **Organize**
  - Hierarchy: projects → sections → tasks → up to 4 levels of sub-tasks ([help](https://www.todoist.com/help/articles/introduction-to-sub-tasks-kMamDo))
  - Labels, 4 priorities†, due date/time, a separate Deadline field, task duration (Pro)
  - Project and section descriptions (July 2026); templates
  - No start dates, custom fields or dependencies
- **Views**
  - List, Board, Calendar layout (Pro); Today and Upcoming
  - Saved filter views (3 free, 150 Pro) using a boolean query language, e.g. `today & p1`†
  - Calendar colouring by priority, project or label (August 2026)
- **Planning & Time**
  - Google Calendar sync with time blocks based on task duration (two-way†)
  - Custom reminders (Pro); location reminders†
  - Completion-based repeats (`every!`)†; "Weekdays" repeat option (May 2026)
- **Focus & Habits**
  - Karma points, streaks and daily/weekly goals ([features](https://www.todoist.com/features))
  - Insights (risk, progress, weekly completion, 4-week rolling view) moved from Business down to Pro (July 2026)
  - No built-in Pomodoro timer†
- **AI**
  - Ramble launched 21 January 2026, runs on Gemini 2.5 Flash Live and covers 38 languages ([toolszai](https://toolszai.com/tool/todoist-ai/))
  - Task Assist and Email Assist (Pro)
  - Official hosted MCP server at `ai.todoist.net/mcp` (OAuth; tasks, projects, sections, labels, comments) ([usecarly](https://www.usecarly.com/blog/todoist-mcp/))
- **Collaboration**
  - Shared projects, assignees, comments with files and voice notes
  - Business tier: team workspace, roles, 500 team projects, a People workload tab (April 2026), SOC 2 Type II
- **Integrations & API**
  - Unified REST API v1 described by an OpenAPI spec, a Sync endpoint and webhooks
  - Official Python and TypeScript SDKs
  - Official `td` command-line tool, with installable skills for coding agents ([developer.todoist.com](https://developer.todoist.com/))
  - Hosted MCP server; 80–90+ integrations
- **Platforms:** web, iOS, Android, macOS, Windows, Linux†, Apple Watch, Wear OS, browser extensions, email add-ons, CLI
- **Pricing** ([pricing](https://www.todoist.com/pricing), [usecarly](https://www.usecarly.com/blog/todoist-pricing/))
  - Free: 5 projects, 3 filter views, 1 week of activity history, 5 MB uploads, limited Ramble, no calendar layout, no AI Assist
  - Pro: $5/mo billed annually ($60/yr) or $7 month-to-month
  - Business: $8/user/mo billed annually or $10 month-to-month
  - Prices rose in December 2025 (Pro was $4, Business $6)

**Offline and privacy:** offline-capable apps†. SOC 2 Type II on the Business tier. No end-to-end encryption†.

**Users praise:** the best natural-language quick-add in the segment, the same experience on every platform, and the integration and ecosystem depth.

**Users complain:** the 5-project free cap and constant upgrade prompts, the December 2025 price rise, no start dates, AI that feels behind, and limited reporting ([Hack'celeration](https://hackceleration.com/labs/review/todoist), [morgen](https://www.morgen.so/blog-posts/todoist-pricing)).

**Recent (2025–26):** Ramble, Task Capture, urgent reminders, Deadline shortcuts, Insights on Pro, the People tab, calendar colouring, the CLI and MCP.

---

## 2. TickTick
**Positioning:** An all-in-one personal planner (tasks, calendar, habits, Pomodoro) at a low price. It is the closest like-for-like Todoist alternative and led the July 2025 Android Authority reader poll with 35% ([2sync](https://2sync.com/blog/ticktick-vs-todoist)).

**Features**
- **Capture**
  - Natural-language date parsing, free
  - Voice "AI Mode": fills in date, list, tags and priority, and splits one utterance into several tasks (~April 2026)
  - AI transcription and summaries for voice notes
  - Widgets, desktop shortcut, email reminders; Siri and email-to-task†
- **Organize**
  - Folders → lists (9 free, 299 Premium) holding 99 or 999 tasks each ([upgrade page](https://ticktick.com/about/upgrade))
  - Multilevel nested tasks; checklist items (1 free, 199 Premium)
  - Tags, priorities†, task duration (Premium), custom smart lists (Premium), countdowns
- **Views**
  - List, Kanban, Timeline (Gantt-style, drag to change durations; Premium) ([features](https://ticktick.com/features))
  - Calendar in day, week, month, year and agenda layouts; the year view has an activity heatmap (8.0)
  - Eisenhower Matrix (basic free, advanced Premium)
- **Planning & Time**
  - Calendar subscriptions and a Google Calendar integration
  - Reminders: 2 per task free, 5 Premium
  - Location reminders (iOS)
  - "Constant Reminder" keeps nagging until the task is done
  - Daily review prompt, time-zone handling, Suggested Tasks for today
- **Focus & Habits**
  - Pomodoro/focus timer with statistics
  - Habit tracker (5 free, 299 Premium) with statistics; countdowns
- **AI**
  - AI Mode voice input; Suggested Tasks, based on creation patterns and rescheduling history
  - Official hosted MCP at `mcp.ticktick.com`, using OAuth or an API token. It covers tasks, lists, habits, focus records and countdowns ([usecarly](https://www.usecarly.com/blog/ticktick-mcp/))
- **Collaboration:** shared lists (2 members free, 29 Premium) with task assignment
- **Integrations & API:** Open API (OAuth), MCP, Notion, calendar subscriptions. There are **no webhooks** (the "webhook gap" in usecarly's write-up).
- **Platforms:** web, iOS, Android, macOS, Windows; Linux, watch apps and browser extensions†
- **Pricing:** Free, or Premium at $49.99/yr (~$4.17/mo) on the [official page](https://ticktick.com/about/upgrade). Some reviews still quote an older ~$36/yr. No monthly price is listed.

**Users praise:** the breadth of features for the money, and tasks, calendar, habits and Pomodoro living in one app.

**Users complain:**
- Too many features for newcomers.
- Occasional sync inconsistencies; task order doesn't sync across devices ([Capterra](https://www.capterra.com/p/170641/TickTick/reviews/?page=2)).
- Trustpilot reviewers say they were charged again after cancelling, and describe cancellation as "IMPOSSIBLE" with no response from support ([Trustpilot](https://ca.trustpilot.com/review/ticktick.com)).
- The free tier allows only 1 checklist item per task.

**Recent:**
- 8.0 (8 January 2026): Suggested Tasks, the year view, a "Modern" calendar style, pinch-to-zoom month view, card style on desktop, custom colours ([AlternativeTo](https://alternativeto.net/news/2026/1/ticktick-8-0-adds-suggested-tasks-improved-yearly-monthly-views-and-customization-options/)).
- 8.x (~April 2026): AI Mode, MCP, AI transcription.

---

## 3. Things 3 (Cultured Code)
**Positioning:** A calm, design-led task manager for solo Apple users, sold as a one-time purchase.

**Features**
- **Capture**
  - Global Quick Entry on Mac with natural-language dates; "Magic Plus" button
  - Mail to Things, Siri, Shortcuts, URL scheme ([features](https://culturedcode.com/things/features/))
  - Interactive widgets, Control Center on Mac and Watch, Spotlight to-do creation on Mac (OS 26)
- **Organize**
  - Areas → Projects → Headings → To-dos → Checklists (one level)
  - Tags; a separate **When (start) date and Deadline**; This Evening; Someday; Logbook
  - Markdown notes; progress pies
  - No priorities, custom fields or dependencies
- **Views:** Inbox, Today (with calendar events), Upcoming, Anytime, Someday, Logbook; Quick Find with tag filtering; multiple windows. No board, calendar grid or timeline.
- **Planning & Time**
  - Calendar events shown read-only; time-based reminders only (no location reminders listed)
  - Repeating to-dos. Since 3.23 (19 August 2026) they can be completed early and rescheduled ([blog](https://culturedcode.com/things/blog/))
- **AI:** Apple Writing Tools inside notes only. No native AI and no MCP.
- **Collaboration:** none
- **Integrations & API:** Shortcuts, URL scheme, AppleScript†. No web API and no Zapier.
- **Platforms:** Mac, iPhone, iPad, Apple Watch, Vision Pro. No web, Windows or Android.
- **Pricing:** one-time $49.99 Mac, $9.99 iPhone (includes Watch), $19.99 iPad, $29.99 Vision Pro. The three main platforms cost $79.97 together. Things Cloud sync is free ([ellieplanner](https://ellieplanner.com/productivity-copilot/things-3-pricing)).

**Offline and privacy:** fully local-first. Things Cloud was rebuilt in Swift in May 2025 for faster sync. Not end-to-end encrypted†.

**Users praise:** the design, speed, the Today/Someday model, start dates versus deadlines, keyboard shortcuts, and no subscription.

**Users complain** ([AsianEfficiency](https://www.asianefficiency.com/task-management/things-3-review/)): Apple-only with no web app, no collaboration, no AI or advanced voice capture, and no integrations or calendar sync. Recurrence is basic ("every third Tuesday" isn't possible). There is still no Things 4.

**Recent:** OS 26 redesign (15 September 2025), 3.23 repeat fixes (August 2026), OS 27 compatibility (6 September 2026).

---

## 4. Microsoft To Do
**Positioning:** A free Wunderlist successor that serves as the personal-task layer of Microsoft 365 (Outlook, Teams, Planner).

**Features** ([what's new](https://support.microsoft.com/en-us/todo/what-s-new-in-microsoft-to-do))
- **Capture**
  - Flagged Outlook emails become tasks (up to 10 from the last 2 weeks)
  - Tasks created in Outlook and Teams sync in
  - Natural-language dates are limited†
- **Organize**
  - Lists and list groups; Steps (one level of subtasks)
  - Importance star, categories, due date, reminder, recurrence, notes
  - Attachments up to 25 MB (personal lists only)
  - The Graph API has a `startDateTime` field, but the app has no start-date field†
- **Views**
  - My Day, Important, Planned, Assigned to Me, Flagged email
  - Custom list backgrounds (v2.0)
  - No board or calendar view
- **AI:** none in the app. Microsoft is putting AI task features into Copilot and Planner instead.
- **Collaboration:** shared lists; assign tasks to members (v1.62)
- **Integrations & API:** Microsoft Graph To Do API covering lists, tasks, checklist items and "linked resources" back to the source item ([MS Learn](https://learn.microsoft.com/en-us/graph/todo-concept-overview)). Power Automate and Zapier†.
- **Platforms:** Windows, macOS, iOS, Android, web, with builds dated March–June 2026. No Linux or watch app ([Wikipedia](https://en.wikipedia.org/wiki/Microsoft_To_Do)).
- **Pricing:** free

**Users praise:** free, clean, Outlook integration, the My Day ritual.

**Users complain:** infrequent updates, unreliable or delayed notifications, no comments or activity log, one level of steps, and integrations limited to the Microsoft ecosystem ([aggregated reviews](https://www.cloudwards.net/microsoft-to-do-review/)).

**Recent:** effectively maintenance mode. Microsoft's 2026 task investment went to Planner (task chats and goals; the iCal feed was retired) and to a unified Copilot task view ([Neowin](https://www.neowin.net/news/microsoft-confirms-major-2026-update-to-remove-several-planner-features-add-new-ones/)).

---

## 5. Any.do
**Positioning:** A consumer and family planner that combines tasks, calendar, a daily planning ritual, and reminders delivered through messaging apps.

**Features** ([any.do](https://www.any.do/))
- **Capture:** natural-language input, voice, WhatsApp task creation and reminders (Premium), browser extensions, widgets
- **Organize:** lists, subtasks, colour tags (Premium). **Recurring tasks are Premium-only.**
- **Views:** My Day daily planner; unified calendar of tasks and events; boards; Gantt and time tracking in the Teams tier
- **Planning & Time:** two-way Google Calendar sync (per reviews); location reminders (Premium); a guided "Moment" morning review
- **AI:** AI Assistant; "Break It Down" into subtasks; suggestions for clearer task names
- **Collaboration**
  - Shared lists and boards, task assignment, in-task chat
  - Grocery lists auto-grouped by aisle
  - Family plan for 4 members
- **Integrations:** "6,000+" connections via Zapier; Slack, Gmail, Teams, Zoom
- **Platforms:** web, iOS, Android, Mac, Windows, Apple Watch, Wear OS, extensions for Chrome, Firefox, Safari and Edge
- **Pricing** ([pricing](https://www.any.do/pricing))
  - Premium: $4.99/mo billed annually or $7.99 month-to-month
  - Family (4 members): $8.33/mo billed annually or $9.99 month-to-month
  - Teams: $4.99/member/mo billed annually or $7.99 month-to-month

**Users praise** (Capterra 4.7 from 1,114 reviews): ease of use, sync, calendar and tasks together, Plan My Day, WhatsApp ([Capterra](https://www.capterra.com/p/173614/Any-do/reviews/)).

**Users complain:** basics are paywalled (recurring tasks, location reminders, colour tags), widgets lag when syncing, the subscription model, and shallow project features.

**Recent:** I could not verify any dated 2025–26 changelog entries.

---

## 6. Google Tasks
**Positioning:** Free, minimal tasks built into Gmail, Calendar and Workspace.

**Features**
- **Capture**
  - Turn an email into a task, with a link back to the message
  - Create tasks from Chat messages (added 2022)
  - The Gemini app can add, edit and show tasks via `@Google Tasks` (generally available May 2025) ([Workspace Updates](https://workspaceupdates.googleblog.com/2025/05/google-workspace-apps-are-now-generally-available-for-the-gemini-app.html))
- **Organize**
  - Lists; one level of subtasks; due date and time; Drive attachments; recurring tasks
  - Deadlines (mid-November 2025): date only, and not shown in the main list ([Android Authority](https://www.androidauthority.com/google-tasks-deadline-release-3616315/))
- **Views:** per-list views; sort by deadline (November 2025); tasks in the Calendar side panel; standalone web app at tasks.google.com ([2sync](https://2sync.com/blog/google-tasks-complete-guide))
- **Planning & Time:** "Block time for a task" in Google Calendar with Do Not Disturb, available on personal accounts too (November–December 2025) ([Workspace Updates](https://workspaceupdates.googleblog.com/2025/11/block-time-for-tasks-google-calendar.html))
- **AI:** Gemini only, through cross-app orchestration across Workspace (September 2026). No AI inside the Tasks app.
- **Collaboration:** no native list sharing and no assignees
- **Integrations & API:** Google Tasks API†; third-party tools like TasksBoard add kanban
- **Platforms:** web and Workspace side panels, Android, iOS. No desktop app.
- **Pricing:** free

**Users complain:** no priorities, labels, sharing, reminders separate from the due time, rich notes, or deep subtasks. The deadline feature feels half-built ([2sync](https://2sync.com/blog/google-tasks-complete-guide), [TDPM](https://thedigitalprojectmanager.com/tools/google-tasks-review/)).

---

## 7. Apple Reminders
**Positioning:** The free default for Apple users, now gaining AI and power features with each OS release.

**Features**
- **Capture**
  - Siri; share sheet; interactive widgets
  - "New Reminder" control for Control Center, the Action Button and the Lock Screen (iOS 26)
  - Suggested Reminders from shared emails and web pages (Apple Intelligence)
  - Call-back reminders from the Phone app ([9to5Mac](https://9to5mac.com/2025/10/13/heres-everything-new-in-reminders-with-ios-26/))
  - iOS 27: describe a reminder in plain language and AI fills in the details; suggestions drawn from Messages ([9to5Mac](https://9to5mac.com/2026/08/26/heres-everything-new-for-reminders-in-ios-27/))
- **Organize**
  - Lists and sections; AI "Auto-Categorize" sorts a list into sections
  - Tags, flags, priority, subtasks†
  - Grocery-list auto-sort, more accurate and multilingual in iOS 27
  - No start dates
- **Views:** smart lists (Today, Scheduled, Flagged, custom rule-based lists†); column/kanban view†
- **Planning & Time**
  - Time and location reminders
  - "Urgent" alarms that break through (iOS 26.2) ([TechCrunch](https://techcrunch.com/2025/11/12/ios-26-2-beta-adds-new-liquid-glass-customization-alarms-in-the-reminders-app-and-more))
  - Default time-zone override
  - iOS 27 inline editor gains Date, Time, Urgent, Repeat, Location, Tag, Flag and Camera
- **AI:** Auto-Categorize, Suggested Reminders, natural-language entry (iOS 27)
- **Collaboration:** shared lists with assignment†
- **Integrations & API:** EventKit, Shortcuts, CalDAV. No web API.
- **Platforms:** iPhone, iPad, Mac, Watch, plus a limited iCloud.com web app. No Android or Windows.
- **Pricing:** free
- **Privacy:** end-to-end encrypted when Advanced Data Protection is on, except reminders synced over CalDAV ([Apple](https://support.apple.com/en-us/102651))

**Users complain:** clunky entry before iOS 27, no start dates, a weak web app, no Android or Windows ([Geeky Gadgets](https://www.geeky-gadgets.com/apple-reminders-30-day-review/)). TechRadar ran a piece titled "iOS 26 could move me to Reminders" from Things.

---

## 8. Superlist
**Positioning:** A modern lists-plus-notes app from the Wunderlist founders†, now moving toward "meetings and messages → tasks" AI.

**Features**
- **Capture:** Talk voice AI (auto language detection, preview before saving); capture from Gmail and Slack; AI meeting notes that become tasks; widgets
- **Organize:** infinitely nested lists, sublists and subtasks; notes inside tasks; tags; due dates; recurrence by day of week (v1.57, August 2026); activity log; bulk multiselect ([updates](https://www.superlist.com/updates))
- **Views:** Today view with Google Calendar meetings; activity heatmap (v1.55). Reviews say there is no calendar view.
- **Planning & Time:** Google Calendar sync. Tasks appear as all-day events, or 30-minute blocks if they have a time. Recurring tasks show only their first occurrence ([help](https://help.superlist.com/en/articles/10062-google-calendar-integration-see-tasks-alongside-events)).
- **AI:** meeting transcription, summaries and tasks (on mobile since June 2026); chat with past meetings; "Make AI" generation; email and Slack summarization
- **Collaboration:** shared lists, assignment, unlimited team members on paid plans
- **Integrations & API:** Gmail, Slack, Linear, GitHub, Google Calendar; MCP server (v1.54, May 2026)
- **Platforms:** macOS, iOS, Android, web; works offline
- **Pricing** ([pricing](https://www.superlist.com/pricing))
  - Free: 5 lists, 5 people on shared lists, no integrations or AI
  - Basic: $5/person/mo ($59/yr)
  - Super: $21/person/mo ($249/yr)
  - The help centre still describes a "Pro" plan capped at 30 recordings a month, so plan naming is inconsistent

**Users praise:** the design and flexible nesting.

**Users complain:** upgrade prompts everywhere on the free plan, a product that feels unfinished (tags, backlinks, bulk edit, keyboard gaps), and sync and team-sync bugs ([efficient.app](https://efficient.app/apps/superlist), [Product Hunt](https://www.producthunt.com/products/superlist/reviews)).

---

## 9. Remember The Milk (RTM)
**Positioning:** The 20-year veteran (started 2005), for power users who want Smart Add syntax, smart-list search and scripting.

**Features**
- **Capture**
  - Smart Add: `#tag`, `@location`, `*repeat`, `=estimate`, `+contact`, plus natural-language dates ([help](http://www.rememberthemilk.com/help/?ctx=basics.smartadd.whatis))
  - Email-to-task; new Gmail add-on
- **Organize:** lists, tags (coloured on Pro), subtasks (Pro only), priorities†, start and due dates†, time estimates, locations, attachments via Dropbox and Drive (Pro)
- **Views:** smart lists built from search queries†; advanced sorting (Pro)
- **Planning & Time:** reminders by email, SMS and IM on free; mobile push on Pro; Google Calendar; Outlook sync (Pro)
- **AI:** RTM MCP server, in beta, on Pro ([what's new](https://www.rememberthemilk.com/new/))
- **Automation:** MilkScript, a script editor for templates and reports (Pro); Zapier
- **Collaboration:** share with 2 people on free; unlimited with permissions on Pro
- **Platforms:** web, iOS, Android, Apple Watch (Pro); desktop apps†
- **Data portability:** JSON and CSV export; import from Todoist and Toodledo
- **Pricing:** Free Basic, or Pro at $49.99/yr ([upgrade](https://www.rememberthemilk.com/upgrade/))

**Recent:** iOS 26 and watchOS 26 support; 20th anniversary. I did not verify review sentiment. Gating subtasks behind Pro is an obvious weakness.

---

## 10. Twos → NewTwos
**Positioning:** A notes-first "write things down" daily-list app. It was rebuilt from scratch with AI as NewTwos, which will replace the original Twos ([Medium, July 2026](https://medium.com/twosapp/why-newtwos-762fc72b4984)).

**Features**
- **Capture:** fast entry with auto date detection; capture via WhatsApp, email and text; browser extensions; a ChatGPT app; Apple Notes import
- **Organize:** "things" in daily lists that roll over automatically, plus topic lists; sub-items; tags and auto-sort (paid upgrades)
- **Views:** capture, map, memory, "things" and timeline views, with drag-and-drop time-blocking on the timeline
- **Planning & Time:** location reminders, Apple Reminders integration, calendar integration
- **Focus & Habits:** streaks; focus mode
- **AI:** AI chat and search over your notes; unobtrusive next-action suggestions
- **Platforms:** web, iOS, Android, Mac, Windows, Linux, Apple Watch, Chrome, Safari, Firefox, ChatGPT
- **Pricing:** core is free. Plus costs $4.99/mo or $39.99/yr, and Plus Lifetime is $199 ([App Store](https://apps.apple.com/us/app/newtwos-quick-notes-lists/id6748264078)). Legacy Twos used pay-what-you-want at $2, $5 or $10/mo.

**Users complain:** the user base is tiny (4.1★ from 31 ratings), sub-items behave oddly, and there's no rich text.

---

## 11. 2Do
**Positioning:** An indie power-user app with extreme flexibility over where your data syncs. One-time purchase.

**Features** ([2doapp.com](https://www.2doapp.com/))
- **Capture:** natural-language input (dates, times, priorities); global Quick Entry on Mac; Mail-to-2Do
- **Organize:** lists, projects, checklists; tags (e.g. @waiting); smart lists; pause a task; durations; password-protected lists; batch editing
- **Views:** multiple windows; focus/filter mode; "Nearby" location panel; calendar events alongside tasks (iOS)
- **Planning & Time:** multiple alerts per task; location reminders; flexible repeats
- **AI:** on-device auto-prioritization (iOS)
- **Sync options:** Dropbox, iCloud CalDAV, Apple Reminders, Todoist, Toodledo, Fastmail, Fruux, custom CalDAV, and local Wi-Fi with no account. Encrypted in transit.
- **Platforms:** macOS 13+, iOS 18.6+, Android 6+
- **Pricing:** Mac $49.99 one-time (also on Setapp); iOS $9.99 one-time; Android is free with a Pro in-app purchase

**Recent:** a third-party download listing reports v3.72 on 2 October 2025. Watch out for an unrelated, newer App Store app called "2Do – Smart Task Management" from a different developer ([App Store](https://apps.apple.com/us/app/2do-smart-task-management/id6762377780)). I did not verify review sentiment.

---

## 12. Newer entrant worth tracking: Tiimo
- 2025 **iPhone App of the Year** ([Daring Fireball](https://daringfireball.net/2025/12/2025_app_store_award_winners)).
- An AI planner and to-do app designed for ADHD and neurodivergent users. Its AI Co-Planner breaks to-dos into steps and then into a visual, colour-coded schedule.
- iPhone, iPad and Watch only. $54/yr or $12/mo.
- It shows there is demand for "AI turns my list into a day plan" with accessibility-first design.

---

## Segment-level takeaways

**Table stakes (nearly every app has these):**
- Lists or projects with one level of subtasks
- Due dates with time reminders
- Recurring tasks
- Today and Upcoming smart views
- Natural-language date entry
- Widgets, and voice or assistant capture
- Cross-device sync and shared lists

As of 2026, **voice or AI capture and an MCP server** are quickly becoming table stakes too: Todoist, TickTick, Superlist and RTM have MCP, and a tiny indie clone already shipped one.

**Best-in-class by feature**

| Feature | Leader | Why |
|---|---|---|
| Quick-add syntax | **Todoist** (RTM pioneered it) | Projects, labels, priorities, `{deadline}` and `!urgent!` reminders all in one line |
| AI voice capture | **Todoist Ramble** / **TickTick AI Mode** | Multiple tasks from one utterance; 38 languages; assignees |
| All-in-one planner value | **TickTick** | Calendar year view, timeline, Eisenhower, Pomodoro, habits for $49.99/yr |
| Start vs deadline model, calm UX | **Things 3** | Separate When/Deadline fields plus Evening and Someday |
| Developer platform | **Todoist** | API v1, OpenAPI spec, webhooks, SDKs, CLI, hosted MCP |
| Ecosystem capture | **Apple Reminders** / **MS To Do** / **Google Tasks** | Siri and Messages suggestions; flagged Outlook emails; Gmail tasks |
| Privacy and sync choice | **2Do** / **Apple (Advanced Data Protection)** | CalDAV, Dropbox, local Wi-Fi, list passwords / end-to-end encryption |
| Scripting | **RTM MilkScript** | User-written automations |
| Meetings/messages → tasks | **Superlist** | Bot-free meeting notes, plus Slack and email summaries |
| Nagging reminders | **TickTick** Constant Reminder; **Todoist** and **Apple** Urgent alarms | Alarms that break through DND |
| Messaging-channel reminders | **Any.do** WhatsApp | Reminders arrive where users already look |

**Gaps and unmet needs I observed**
1. **Start dates are still missing** in Todoist, Apple Reminders, Google Tasks and the Microsoft To Do app. Only Things does start vs deadline well, and it's Apple-only.
2. **No first-class task dependencies or custom fields** appeared in any feature page I reviewed.
3. **No end-to-end encryption among the cross-platform leaders.** Only Apple (with Advanced Data Protection) and 2Do's self-hosted CalDAV route offer real privacy.
4. **Webhooks are rare.** Only Todoist officially has them; TickTick is API-plus-MCP with no webhooks.
5. **AI is mostly about capture** (voice, image, email). Proactive replanning is thin: rescheduling overdue work, balancing load against calendar capacity, or a guided weekly review. TickTick's Suggested Tasks and Todoist's Insights are only partial answers. Tiimo shows demand for AI-built day plans.
6. **Recurrence is still immature in places.** Things only gained early completion in August 2026. Superlist added weekday recurrence in August 2026, and its calendar sync shows only the first occurrence. Things can't do "every third Tuesday."
7. **Pricing and trust friction**:
   - Basics behind paywalls: Any.do recurring tasks, RTM subtasks, Todoist's 5-project cap.
   - Todoist's December 2025 price rise.
   - TickTick billing and cancellation complaints.
   - Superlist upgrade prompts everywhere.
8. **Things-level design on Windows, Android and web** is still unclaimed.
9. **Stagnating incumbents.** Microsoft To Do and Google Tasks are slow-moving free defaults, leaving their users to paid apps.
10. **Sync and notification reliability** is a recurring complaint (TickTick, Superlist, Microsoft To Do), so offline-first sync with dependable notifications is a real differentiator.
