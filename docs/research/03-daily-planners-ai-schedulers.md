# Daily planners, time-blocking and AI auto-scheduling: competitor research, September 2026

**How this was researched:** I checked official pricing pages, help centres, changelogs and App Store listings first, then 2025–2026 reviews and Trustpilot/Reddit summaries. Where only third-party sources exist, or sources disagree, I say so. I hit the session's web-search limit near the end, so a few smaller items were checked by fetching pages directly or are marked unverified. Blogs from Saner.ai, Lifestack, Temporal, Ellie and alfred_ are also competitors, so I used them only to confirm prices, not for opinions.

## Pricing at a glance (USD, individual plan)

| App | Free tier | Paid, billed monthly | Paid, billed annually (per month) | Other |
|---|---|---|---|---|
| Sunsama | No (14-day trial) | $22 | $17 | Team seat $25 / $20 |
| Motion | No (7-day trial, card needed) | Pro AI $19, Business AI $29 | ~$12.73 / ~$19.43 | AI Employee $49/mo (annual only) |
| Akiflow | No (7-day trial) | $34 | $19 | — |
| Reclaim | Yes (Lite) | Starter $12, Business $18* | $10 / $15 | Enterprise $22 (annual only) |
| Morgen | No (14-day trial) | $30 | $15 | Team $25 / $10 per seat |
| Amie | Yes | Pro $25, Business $50 | $20 / $40 | Third-party figures |
| Structured | Yes | $2.99–$8.99 (varies by region) | $9.99–$49.99 a year | Lifetime $99.99 |
| Tweek | Yes | $5.99 | $49.99 a year | Family $9.99 / $89.99 |
| Routine | Yes | $5 / $10 / $15 per seat | 17–38% off | Unclear which billing the shown prices are |
| Ellie | Yes | $9.99 | 20% off | Lifetime $299.99 |
| Tiimo | Yes (mobile only) | $7.99 | $79.99 a year | Family $119.99 a year |
| Llama Life | No (7-day trial) | $4–$6 | $39 a year | $29 for 6 months |
| Saner.ai | Yes | Starter $8, Standard $16 | — | — |
| Blitzit | No (7-day trial) | $6.99 | $4.99 | About $97 lifetime (promo pages) |

\*Reclaim's page rendered its monthly/annual columns ambiguously. Because annual is described as "20% off", annual must be the lower number ($10 / $15).

---

## 1. Sunsama
*Positioning: a calm, ritual-driven daily planner for knowledge workers juggling many tools. Deliberately manual.*

**Features**
- **Capture:** sidebar pulling tasks from connected tools; turn a Slack message or email into a task; quick add.
- **Organize:** channels (tags, now assigned automatically by AI, including for imported calendar events); weekly objectives; backlog.
- **Views:** daily task list or kanban next to the calendar; week board.
- **Planning & Time:**
  - Guided daily planning ritual: pick today's tasks, estimate time, drag onto the calendar.
  - Warning when planned work exceeds available hours.
  - Guided daily shutdown with a "highlights" log; unfinished tasks roll over.
  - Weekly planning and review against objectives.
  - Keyboard shortcut that auto-schedules one task into the next open slot; overlaps shift when a task runs long or finishes early.
- **Focus & Habits:** focus mode, Pomodoro timer, app muting, break reminders.
- **AI:** time estimates predicted from your own history and timer data; automatic channel suggestions; MCP server (lets Claude and other AI assistants read tasks, edit and append notes, see created/modified/completed/due times); automations now fire when tasks are changed through MCP. ([changelog](https://roadmap.sunsama.com/changelog/weekly-product-changelog-september-4-2026))
- **Analytics:** daily and weekly planned-vs-actual time reports.
- **Collaboration:** team workspaces, per-member billing, Enterprise with SSO/SCIM.
- **Integrations & API:** Asana, ClickUp, GitHub, Jira, Linear, Monday, Trello, Todoist, Notion, Microsoft To Do, Google Tasks, Gmail, Outlook, Slack, Teams, Toggl, Zapier. Most sync both ways. CalDAV (Fastmail etc.) is in early beta. ([integrations](https://www.sunsama.com/integrations/linear))
- **Calendars:** Google, Outlook, Apple.
- **Platforms:** web, macOS, Windows, Linux, iOS/iPadOS, Android.
- **Pricing:** $22 monthly or $17/mo annually; 14-day trial with no card; Enterprise custom. ([pricing](https://www.sunsama.com/pricing)) Some 2026 reviews still quote $20/$16, which suggests a recent price rise.

**How the day is structured:** a 5–15 minute morning ritual that ends in a realistic, calendar-anchored plan, and an evening shutdown that closes the day. The friction is intentional: nothing gets scheduled unless you decide it. ([dupple](https://dupple.com/reviews/sunsama))

**Praise:** it builds a planning habit people can't build on their own; the workload warning stops over-commitment; one inbox for 10+ tools; the shutdown creates a clear line between work and personal time.

**Complaints:** price with no free tier; mobile clearly secondary to desktop; no real auto-scheduling; Outlook multi-calendar sync problems (imported meetings reverting was fixed 4 Sept 2026).

**Recent changes (2026):** weekly changelog cadence focused on MCP/agent access, stability and the CalDAV beta rather than AI planning.

---

## 2. Motion
*Positioning: began as the best-known AI auto-scheduler for individuals; now sells an "agentic work suite" to small businesses.*

**Features**
- **Capture:** AI chat; tasks and projects created by AI.
- **Organize:** projects, workspaces, docs, wiki, notes.
- **Views:** calendar, list, kanban; timeline/Gantt on Business.
- **Planning & Time (auto-scheduler):** ([help](https://www.usemotion.com/help/time-management/auto-scheduling/reference-auto-scheduling/how-auto-scheduling-works-behind-the-scenes))
  - Order: ASAP tasks first, then priority, then hard deadlines, then due date.
  - Hard deadlines can be scheduled outside working hours to make the date.
  - Long tasks are split into chunks, with a minimum block size.
  - External events always win; tasks move around them.
  - Past-due tasks move to the next open slot with an overdue flag.
  - Tasks that can't fit get a "Could not fit" warning.
  - The schedule recalculates continuously.
  - Custom working schedules.
- **AI:** AI Chat; AI Projects & Tasks; AI Calendar & Meetings (booking links); AI Docs; AI Task Planner; AI Writer; "AI Employees" (autonomous agents). Usage runs on credits: 7,500 a month on Pro, 15,000 on Business; overage 25¢ / 19¢ per 100 credits. ([pricing](https://www.usemotion.com/pricing))
- **Collaboration:** team capacity planning, dashboards, time tracking, permissions (Business only).
- **Platforms:** web, desktop, iOS, Android.
- **Pricing:** Pro AI $19 monthly / ~$12.73 annually; Business AI $29 / ~$19.43; AI Employee $49/mo (annual only); 7-day trial requires a card; no free plan. ([usecarly, Jul 2026](https://www.usecarly.com/blog/motion-pricing/)) Prices changed several times in 2025, and Motion's homepage no longer shows them prominently. ([Temporal](https://temporal.day/blog/motion-pricing-2026-why-users-leaving))

**Praise:** still widely called the strongest auto-scheduling engine; automatic reshuffling "solved my biggest pain: constantly wasting time rescheduling" (review quoted by [Kai](https://hirekai.ai/blog/motion-app-review)).

**Complaints:**
- Pricing churn and hidden prices ("nickel-and-diming").
- Credit usage makes the monthly price "a floor", not a fixed cost.
- Billing and cancellation friction, including charges right at sign-up.
- Feature bloat: they "chase huge new projects before fixing simple issues" ([Capterra](https://www.capterra.com/p/214264/Motion/reviews/)).
- Hard to justify for solo users now that cheaper tools do the core job.

**Recent changes:** raised $60M at a $550M valuation in September 2025 to build an "agentic work suite for businesses" ([Business Wire](https://www.businesswire.com/news/home/20250905188051/en/Motion-Raises-$60M-at-$550M-Valuation-to-Build-the-Agentic-Work-Suite-for-Businesses); some reviews wrongly date it December 2025). The pivot to credits and AI Employees is the main reason users are leaving.

---

## 3. Akiflow
*Positioning: keyboard-driven "command centre" that collects tasks from everywhere, for busy professionals and executives.*

**Features**
- **Capture:** universal inbox; global quick-capture shortcut; email-to-task and forwarding to Aki; Slack/Teams message to task; WhatsApp.
- **Organize:** labels, tags, lists, categories; subtasks with progress counters (June 2026).
- **Views:** inbox plus calendar; new mobile Daily Dashboard with a Live Activity.
- **Planning & Time:**
  - Drag tasks onto the calendar to time-block.
  - Schedule Optimizer: one click drops unscheduled work into the next free slot; when a task runs over or under, it offers to re-plan the rest of the day in the same order. ([release 2.76](https://product.akiflow.com/changelog/sunny-akiflow-summer-release))
  - Recurring tasks; availability sharing.
- **AI:** ([Aki](https://akiflow.com/aki))
  - Aki assistant: chat, auto-scheduling, AI daily briefs (morning, midday, end of day), email forwarding, WhatsApp.
  - Aki Meeting Assistant (March 2026): joins Zoom/Meet/Teams, transcribes, pulls out to-dos.
  - Hosted MCP server at mcp.akiflow.com.
  - "Continue in Claude/ChatGPT" (release 2.80).
- **Analytics:** productivity analytics.
- **Integrations & API:** Asana, ClickUp, Notion, Todoist, Trello, Jira, Linear, Microsoft To Do, Gmail, Outlook mail, Slack, Teams, GitHub, Zoom, Zapier, IFTTT. ([integrations](https://akiflow.com/integrations))
- **Calendars:** Google and Outlook. iCloud is not listed.
- **Platforms:** desktop, web, iOS, Android.
- **Pricing:** $34 monthly or $19/mo annually ($228/yr); 7-day trial. ([pricing](https://akiflow.com/pricing))

**Praise:** fast capture and consolidation; power-user keyboard flow.

**Complaints:** billing is the loudest, including charges after cancellation, no renewal reminder, and refunds refused "per policy". It rates 4.0 on Trustpilot versus 4.8 on G2. ([Saner summary](https://blog.saner.ai/akiflow-reviews/), [Trustpilot](https://ie.trustpilot.com/review/akiflow.com)) The monthly price is steep.

**Recent changes:** repositioned from a task inbox to an "AI executive assistant" (meeting bot, briefs, MCP) during 2026.

---

## 4. Reclaim.ai (owned by Dropbox)
*Positioning: an AI layer on top of Google/Outlook calendars that protects focus time, habits and task time. Strong with teams.*

**Features**
- **Planning & Time:** ([help](https://help.reclaim.ai/en/articles/4129406-how-reclaim-uses-free-and-busy-time-to-keep-your-schedule-flexible))
  - One priority scale, P1 (critical) to P4 (low), shared by tasks, habits, meetings and links.
  - Its blocks start as "Free" and flip to "Busy" (locked) as time fills up or a deadline nears, which acts as an "at-risk" signal.
  - Focus Time goals it defends.
  - Habits: flexible recurring blocks.
  - Buffer Time: breaks and travel.
  - Automatic rescheduling.
  - Scheduling horizon: 1 week (Lite) up to 12 weeks.
- **Meetings:** Smart Meetings (best time across attendees); Scheduling Links; Meeting Quality agent (RSVP handling).
- **AI:** everything is framed as "AI Agents" (5 on Lite, unlimited on Enterprise). ([pricing](https://reclaim.ai/pricing))
- **Analytics:** time tracking, Deep Work Index, meeting load and fragmentation, workforce dashboards.
- **Collaboration:** team out-of-office calendar, delegated access, webhooks (Business), SSO/SCIM, org-chart-aware scheduling (Enterprise).
- **Integrations & API:** Google Tasks, Slack, Zoom, Meet (Lite); Todoist, Asana, ClickUp, Jira, Linear (paid); Raycast; Salesforce/HubSpot "coming soon".
- **Calendars:** Google and Outlook; multi-calendar sync. No iCloud.
- **Platforms:** web only. A native iOS app is "In Planning" and hadn't shipped as of July 2026. ([Calmevo](https://calmevo.com/reclaim-ai-review/))
- **Pricing:** Lite free (1 calendar sync, 1 link, 1-week horizon); Starter $10 annual / $12 monthly; Business $15 / $18; Enterprise $22 annual only; 30%-off promo for new users.

**Praise:** best version of flexible habits; reschedules intelligently when meetings move; generous free tier; automatic buffers.

**Complaints:** no mobile app (the #1 complaint); auto-rescheduling moves blocks unexpectedly; entry price has roughly doubled since 2022 (~$6.50 to $10–12). ([UsagePricing](https://www.usagepricing.com/blueprint/reclaim-ai))

**Recent changes:** acquired by Dropbox in August 2024 ([TechCrunch](https://techcrunch.com/2024/08/22/dropbox-acquires-index-ventures-backed-ai-scheduling-tool-reclaim-ai)). Now claims 600K users across 70K companies. Named by reviewers as the natural replacement after Clockwise shut down; third parties report a 12-month price match for Clockwise migrants, but this isn't on Reclaim's own site (unverified).

---

## 5. Morgen
*Positioning: a calendar that combines every account, plus an AI planner that proposes but never auto-moves. For people who want control.*

**Features**
- **Capture:** native tasks; tasks from integrations; duration tags such as "[30m]".
- **Planning & Time:** ([guide](https://www.morgen.so/guides/plan-your-day-using-the-ai-planner))
  - AI Planner builds a daily or weekly proposal. Proposed blocks pulse on the calendar; sliders control planning length, break frequency and task splitting; then "Schedule all" or Esc to discard.
  - Frames: templates for your ideal week that say where certain task types go.
  - Priority based on its "Morgen Priority Factor".
  - Missed tasks: choose "ASAP", "rearrange plan" or "leave unscheduled".
  - Never schedules or moves anything without approval.
  - Calendar automations, travel time, buffers.
- **Meetings:** booking page and links; team availability.
- **Integrations & API:** Notion, Todoist, Linear, ClickUp, Obsidian, Google Tasks, Microsoft To Do.
- **Calendars:** Google, Outlook, iCloud, Fastmail, Zoho. The broadest calendar coverage in this segment.
- **Platforms:** Windows, macOS, Linux, iOS, Android, web, browser extension.
- **Pricing:** Pro $30 monthly or $15/mo annually; Team $25 monthly or $10/seat annually (minimum 2 seats); 14-day trial; 30-day refund. ([pricing](https://www.morgen.so/pricing)) Reviews say the permanent free plan was dropped. The homepage says "no credit card required", which appears to describe the trial.

**Praise:** combining calendars (including iCloud); approval-first control; Linux support.

**Complaints:** AI suggestions "hit-or-miss" and don't learn your patterns; the approval step and Frames setup add friction; no free plan; high monthly price. ([Saner summary](https://www.saner.ai/blogs/morgen-reviews))

---

## 6. Amie
*Positioning: once the "beautiful calendar + todo" app; now mainly an AI meeting note-taker.*

**Features**
- Calendar and to-dos in one interface; Pomodoro timer; menu-bar calendar.
- AI meeting notes that record system audio with no bot joining the call; chat with your notes; AI-drafted follow-up emails; AI scheduling.
- MCP access for Claude and ChatGPT.
- **Integrations:** HubSpot, Notion, Slack, Linear, Pipedrive, Attio; ATS/CRM on Business. ([amie.so](https://amie.so/))
- **Platforms:** macOS, Windows, iOS. No Android.
- **Pricing:** Free (25 one-time meeting-note credits); Pro $25 monthly or $20 annually; Business $50 or $40. These are third-party figures; Amie's page didn't show numbers. ([Ellie, Jul 2026](https://ellieplanner.com/productivity-copilot/amie-app-pricing))

**Praise:** design.

**Complaints:** "crazy expensive now that it focuses on meeting notes only"; calendar and to-dos are no longer the priority; crashes and slow loading; no Android.

**Recent changes:** pivot announced July 2024; interface rebuilt around notes by February 2025. ([Productive with Chris](https://productivewithchris.com/app-reviews/amie-review-2025/))

---

## 7. Structured
*Positioning: a visual, mobile-first day timeline for everyone. Very popular with ADHD users.*

**Features**
- **Capture:** inbox; create and update tasks through Siri (v4.6.0); turn a photo of a handwritten plan into tasks.
- **Organize:** colours, 300+ icons, colour prediction; subtasks and notes.
- **Views:** visual day timeline; week and month views.
- **Planning & Time:** drag tasks onto the timeline; imports calendars and Reminders; "Replan" pushes missed tasks forward; recurring tasks.
- **Focus & Habits:** Pomodoro focus timer (v4.5.0); Live Activities; widgets; Energy Monitor to avoid overloading a day; cycle tracking ("Cycle Seasons"); habits.
- **AI:** Structured AI plans your day through conversation and accepts image attachments.
- **Platforms:** iOS, iPad, Mac, Apple Watch, Android, web. Android and web lag well behind iOS.
- **Pricing:** Free; Pro $2.99–$8.99 monthly or $9.99–$49.99 a year depending on region/price tier; Lifetime $99.99 ([App Store](https://apps.apple.com/us/app/structured-daily-planner-todo/id1499198946)). Third parties cite $29.99/yr and a $64.99 lifetime, so prices vary.
- **Scale:** 15M+ downloads, 500K+ paying Pro users ([structured.app](https://structured.app/)); 4.8 stars from 166K ratings; Editor's Choice.

**Praise:** instant visual clarity; low friction; good fit for ADHD.

**Complaints:** unreliable iCloud sync; duplicate notifications; freezing ([Toolradar](https://toolradar.com/tools/structured)); users ask for automatic bumping when something new is added, and for "locked" events.

---

## 8. Tweek
*Positioning: a minimalist paper-style weekly spread. Not a time-blocker.*

**Features**
- Weekly spread as the default view; "Someday" list; day and month views.
- Notes, checklists, subtasks, attachments, colour themes, sharing, recurring tasks.
- Two-way sync with Google, Outlook, Apple Calendar and Reminders (Premium). One App Store review says Outlook sync is still pending, so this is unclear.
- **Platforms:** iOS, iPad, Mac, web, Android.
- **Pricing:** Free; Premium $5.99 monthly or $49.99 a year; Family $9.99 / $89.99; no trial, 14-day money-back. ([App Store](https://apps.apple.com/us/app/tweek-minimal-weekly-planner/id1535438855))

**Praise:** simplicity; 4.8 stars from 1.3K ratings.

**Complaints:** no hourly time slots; recurring tasks can't be deferred; crashes when recurring tasks have many subtasks. No AI at all.

---

## 9. Routine
*Positioning: an all-in-one planner combining tasks, calendar, notes and a command bar, now adding AI meeting notes and agents.*

**Features**
- **Capture and views:** inbox, Agenda, Calendar, Tasks, Pages (notes), journaling, labels, command palette.
- **Planning:** time-blocking and timeboxing; event colouring.
- **AI:** meeting notes, agents, automations, voice commands; credits from 500 to 10,000 per seat.
- **Integrations:** claims 167+ ([routine.co](https://routine.co/)).
- **Platforms:** macOS, Windows, Linux, web, iOS, Android.
- **Pricing:** free tier; Personal $5, Professional $10, Business $15/seat; Enterprise custom; annual discounts of 38% / 17% ([pricing](https://routine.co/pricing)). It's unclear whether the shown prices are monthly or annual.

**Reviews:** clean design and a good Agenda view, but the workflow isn't always intuitive and some features feel experimental. Works best as a light planner on top of Google Calendar. ([Efficient App](https://efficient.app/apps/routine))

---

## 10. Ellie Planner
*Positioning: a solo-developer "brain dump + timebox" planner in the paper-planner style.*

**Features**
- **Capture:** brain dump; email forwarding; Siri shortcuts.
- **Views:** endless kanban scrolling across dates; week calendar; today-only mode.
- **Planning:** timebox mode (drag onto calendar); unfinished tasks roll over; recurring tasks and routines; subtasks and labels.
- **Tracking:** built-in time tracker; analytics.
- **AI:** "AI Assistant" is listed on the Pro plan, but the homepage doesn't describe it, and reviewers say there's no AI scheduling or re-planning.
- **Integrations:** Google, Apple and Outlook calendars; Notion; Zapier.
- **Platforms:** Mac, Windows, web, iPhone, iPad. No Android.
- **Pricing:** Free (tasks and brain dump only); Pro $9.99/mo (20% off yearly); Lifetime $299.99; 50% student discount. ([pricing](https://ellieplanner.com/pricing))

**Complaints:** the free tier lacks timeboxing and calendar sync; no Android; worries about a one-person team.

---

## 11. Tiimo
*Positioning: visual planner built for neurodivergent users (ADHD, autism). Apple's 2025 iPhone App of the Year.*

**Features**
- **Views:** colour- and icon-coded visual timeline; circular visual timer (part of the core design, not a paid feature).
- **Planning:** AI Co-Planner turns thoughts into step-by-step plans with time estimates; routine and activity templates; checklists.
- **Focus & Habits:** focus timer; gentle reminders designed to avoid alert fatigue; mood tracking; streaks; widgets and Live Activities; full Apple Watch planning.
- **Platforms:** iOS, iPad, Apple Watch, Android, Mac, web.
- **Pricing:** Free (mobile only; no AI, focus timer or web); Pro $7.99 monthly or $79.99 a year; Family $119.99 a year for 5; trial only with the annual plan; prices vary by region. ([Lifestack, Jul 2026](https://lifestack.ai/blog/tiimo-pricing), [FAQ](https://www.tiimoapp.com/faq))

**Praise:** calm, inclusive design; team is 30% neurodivergent. ([MacRumors](https://www.macrumors.com/2025/12/04/apple-announces-2025-app-store-award-winners/))

**Complaints:** bugs such as items disappearing from schedules; notifications not firing; "not worth the subscription with bugs". ([JustUseApp](https://justuseapp.com/en/app/1480220328/tiimo-visual-daily-planner/reviews))

**Recent changes:** App of the Year (December 2025); rebuilt in SwiftUI with a "Liquid Glass" redesign.

---

## 12. Llama Life
*Positioning: an ADHD focus list. Every task gets its own countdown timer.*

**Features**
- Per-task countdown timers (timeboxing) with a running estimate of when you'll finish.
- Confetti and other game-like touches.
- Routines and presets; a "Not-Now" list for deferred tasks.
- AI task breakdown (listed on the site) and AI emoji matching; time reports.
- **Platforms:** web, iOS, Android.
- **Pricing:** $4–$6 monthly, $29 for 6 months, $39 a year; 7-day trial. ([App Store](https://apps.apple.com/us/app/adhd-organizer-llama-life/id6454469750))

**Praise:** one reviewer said everything was finished an hour later and "I feel calm."

**Complaints:** managing presets feels heavy; small review base (116 ratings).

---

## 13. Saner.ai
*Positioning: an AI "second brain" and planner for ADHD knowledge workers that combines notes, email and calendar.*

**Features**
- **Capture:** brain dump turned into tasks; voice to text; Chrome extension.
- **Planning:** Skai assistant; one-click "prioritize and schedule"; calendar timeline view; proactive morning check-ins; summaries of email and calendar.
- **Notes:** notes, PDFs, OCR; choice of external models (GPT, Claude, Gemini).
- **Integrations:** Gmail, Slack, Google Calendar, Drive, Outlook (added November 2025). ([saner.ai](https://www.saner.ai/))
- **Platforms:** web, mobile, Chrome extension.
- **Pricing:** Free (30 AI messages a month, 100 notes); Starter $8 (30 a day); Standard $16 ("unlimited", 100 AI requests a day). ([pricing](https://www.saner.ai/pricing))

**Reception:** 4.8 on Product Hunt and 4.6 on iOS, but those claims come from Saner's own blog. I couldn't verify independent complaints before the search limit ran out.

---

## 14. Blitzit
*Positioning: a to-do list that collapses into a floating countdown timer. "Todoist plus focus timer" style.*

**Features**
- **Focus:** list panel that turns into an always-visible floating timer; "Blitz" focus mode; Pomodoro.
- **Planning:** time estimates tracked against actual time; plan the day or week.
- **Reports:** time per list, punctuality; data export.
- **Tracking:** Sessions time tracker (beta, pitched against Toggl and Clockify).
- **AI:** Blitzy AI (beta) turns voice notes and brain dumps into tasks.
- **Integrations:** Notion, ClickUp, Google Calendar, Asana, Todoist, Trello, Linear, webhooks.
- **Platforms:** desktop; the mobile app is described as "75% complete".
- **Pricing:** $6.99 monthly or $4.99/mo annually; 7-day trial; 30-day refund ([blitzit.app](https://www.blitzit.app/)); about $97 lifetime on promo pages ([Blitzit ADHD page](https://www.blitzit.app/adhd)).

---

## 15. Google and Microsoft built-in options
- **Google Calendar task time-blocking:** launched November/December 2025 for all accounts, including personal ones. Pick a time slot, choose "Task", set a duration; you can turn on Do Not Disturb and auto-decline conflicting meetings. ([Workspace Updates](https://workspaceupdates.googleblog.com/2025/11/block-time-for-tasks-google-calendar.html))
- **Gemini:** "Help me schedule" suggests meeting times inside Gmail. Daily Brief (I/O 2026) is an agent that scans inbox, calendar and tasks each morning; US Google AI subscribers only. Gemini Spark, a background agent, is in beta for Ultra. Multi-step scheduling is still limited. ([Google I/O 2026](https://blog.google/innovation-and-ai/technology/ai/google-io-2026-all-our-announcements/))
- **Microsoft:** Copilot in Outlook can book recurring focus blocks, follow standing "calendar instructions", resolve 1:1 conflicts, and flag overbooked days. Its agent features started rolling out from 27 April 2026 through the Frontier early-access programme. ([MS Tech Community](https://techcommunity.microsoft.com/blog/outlook/copilot-in-outlook-new-agentic-experiences-for-email-and-calendar/4514601)) The Planner overhaul in early 2026 retired the iCal feed that showed tasks in Outlook. ([Neowin](https://www.neowin.net/news/microsoft-confirms-major-2026-update-to-remove-several-planner-features-add-new-ones/))
- **Todoist:** calendar layout in the Today view for time-blocking (Pro/Business). Ramble voice-to-tasks launched 21 January 2026 and understands about 38–40 languages. ([TechCrunch](https://techcrunch.com/2026/01/21/todoists-app-now-lets-you-add-tasks-to-your-to-do-list-by-speaking-to-its-ai/))

## 16. Newer AI-first entrants and closures
- **Temporal.day:** schedules around your chronotype and energy; three modes (Suggest / Auto / Off); from $9/mo or $7.67/mo annually. ([temporal.day](https://temporal.day/))
- **Lifestack:** uses Oura/WHOOP/Apple Watch/Garmin data to put deep work in your energy peaks; $7/mo, $50/yr, $120 lifetime. Of little use without a wearable. ([Saner review](https://blog.saner.ai/lifestack-review/))
- **Dola:** a free calendar assistant that lives inside WhatsApp, Telegram, iMessage and Line; voice and screenshot-to-event; two-way sync with Google, Apple and Outlook. ([Agent Finder](https://agent-finder.co/reviews/dola))
- **FlowSavvy:** cheap auto-scheduler. Free tier includes unlimited auto-reschedules and a 2-week horizon; Pro $14 monthly or $10 annually; overcommitment warnings; syncs Google, Outlook and iCloud; API/MCP. ([pricing](https://flowsavvy.app/pricing))
- **Clockwise shut down on 27 March 2026** after a Salesforce acquihire, with about a week's notice and user data deleted. ([Doodle](https://doodle.com/en/clockwise-is-shutting-down-what-to-do-next-in-2026/))

---

## Segment-level takeaways

**What makes time-blocking work, and what makes it fail**
- **Works:**
  - A short, repeatable ritual (Sunsama's plan-then-shutdown).
  - Honest capacity maths: estimate vs available hours, plus an overload warning.
  - Rolling unfinished work forward without guilt.
  - Capture from where work already arrives (Slack, email, Jira).
- **Fails:**
  - Rigid plans that break at the first surprise.
  - Having to re-drag everything by hand after a meeting moves.
  - No mobile app (Reclaim).
  - Unreliable sync (Structured with iCloud, Sunsama with Outlook).
  - Too much setup up front (Morgen's Frames).
- The most common Structured feature request, "bump my tasks when something new comes in", is the gap between manual and automatic in miniature.

**Does AI auto-scheduling deliver?** Partly.
- Motion's engine and Reclaim's habits/priorities are genuinely praised.
- But users report plans being moved without warning, a loss of ownership, and AI suggestions that don't learn (Morgen).
- Reviewers call Motion's AI Employees gimmicky, and credit billing makes costs unpredictable.
- The market is converging on a **hybrid**: suggest or preview first, with one-click "re-plan the rest of today". Examples: Akiflow's Schedule Optimizer, Sunsama's shortcut, Morgen's approval step, Temporal's Suggest/Auto/Off.
- Very few tools learn your real task durations (Sunsama does), and only Lifestack and Temporal attempt energy- or chronotype-aware scheduling.

**Pricing landscape: three tiers**
1. **Premium ($15–34/mo):** Sunsama, Akiflow, Morgen, Amie, Motion Business. None has a free tier, and there are billing complaints (Akiflow, Motion).
2. **Mid ($8–15):** Reclaim, Motion Pro on annual billing, FlowSavvy, Saner, Ellie, Temporal.
3. **Consumer/ADHD ($3–8, often with lifetime options):** Structured, Tiimo, Llama Life, Tweek, Blitzit, Lifestack.

AI credit metering (Motion, Routine) is spreading and generates distrust. Clear flat pricing, easy cancellation and renewal reminders are a real differentiator.

**Best "planning ritual" designs**
- Sunsama's guided daily plan and shutdown, weekly objectives and review.
- Akiflow's AI briefs three times a day.
- Morgen's preview-then-commit.
- Structured and Tiimo's visual timeline plus a gentle re-plan.
- Llama Life's per-task countdown for starting work.

**Gaps and opportunities for a new app**
1. One app combining Sunsama-quality rituals with an optional, explainable auto-scheduler that previews changes, can lock specific blocks, and says why it moved something.
2. Duration learning (estimated vs actual) and energy-aware placement without needing a wearable.
3. Real burnout guards: daily and weekly capacity caps, "you've over-planned three days running" warnings, a protected end of day. Only Sunsama, FlowSavvy and Structured's Energy Monitor partly do this.
4. ADHD-friendly design (visual timeline, countdowns, gentle nudges, small rewards) inside a professional-grade tool with integrations. Right now these are two separate markets.
5. Mobile and desktop parity plus iCloud/CalDAV support. Most competitors are weak on mobile or on iCloud.
6. MCP/agent access as a standard feature. Sunsama, Akiflow, Amie and FlowSavvy already have it.
7. Honest pricing with a real free tier, and a single personal plan under $10/mo.
8. Reliability as a selling point, given the Clockwise shutdown and the Amie and Motion pivots.

**Could not verify:** the Saner.ai complaint pattern; Morgen's 2026 changelog and exactly when its free plan ended; Reclaim's Clockwise price match (third-party only); what Ellie's "AI Assistant" actually does; whether Routine's shown prices are monthly or annual; and whether Blitzit's lifetime deal is still offered.
