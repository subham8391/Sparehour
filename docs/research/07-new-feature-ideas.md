# New and under-served feature ideas for Personal Work Management (researched 2026-09-13)

**How strong the evidence is:** Sunsama is the only app with a large public vote board. Todoist, Things, Motion, Notion and Apple Reminders have no public voting, so demand for those comes from reviews and press. TickTick's board is unofficial and small (17 votes at most). Akiflow's board shows 12 votes at most. One correction: MagicBell's 2026 guide says iOS home-screen web apps lost standalone mode and push in the EU. That's out of date: Apple reversed the decision before iOS 17.4 shipped ([TechCrunch](https://techcrunch.com/2024/03/01/apple-reverses-decision-about-blocking-web-apps-on-iphones-in-the-eu/)).

## A. Long-standing requests that are still unbuilt
1. **Objectives at month, quarter and year level, linked to tasks, with a monthly plan-and-review ritual.** Seen: [Sunsama board](https://roadmap.sunsama.com/improvements?sort=top). Demand: Monthly 1.7k votes, Yearly 1.2k, Quarterly 865, all "Under Review". Sunsama only has weekly objectives. **Fit: High.**
2. **Planned-vs-actual insights.** How accurate your estimates were, where your time went, which tasks keep slipping. Seen: Sunsama "Improved Analytics" (same board). Demand: 685 votes, Under Review. **Fit: High.**
3. **Subtasks as full tasks.** A subtask can be scheduled on its own day or time block. Seen: Sunsama. Demand: 902 votes. **Fit: Medium.**
4. **Recurring-task exceptions.** Complete a repeat early, choose "update the rule" or "just this once" when rescheduling, create the next copy manually, pause many repeats at once. Seen: Things 3.23 ([iDrop](https://www.idropnews.com/news/things-3-repeating-tasks-update-2026/267466/)). Demand: Things' most-requested feature for nine years. **Fit: High.**
5. **Per-task miss policy.** Each task chooses what happens when missed: roll forward, skip that instance, or expire. Routines never pile up as overdue. Seen: [TickTick unofficial board](https://ticktick.featurevote.app/) (top item, 17 votes) and [Akiflow](https://product.akiflow.com/) ("Routines without overdue backlog"). Our carry-over applies to every task; this makes it per task. **Fit: High.**
6. **Colour and emoji rules.** Colour tasks automatically based on their properties. Seen: Sunsama "Color code tasks" (652 votes), TickTick conditional formatting (5 votes), [Tiimo](https://www.tiimoapp.com/)'s emoji-and-colour blocks. **Fit: Medium.**
7. **Daily note or scratchpad separate from tasks.** Seen: [Sunsama "General notes"](https://roadmap.sunsama.com/improvements/p/general-notes-features). **Fit: Medium.**
8. **Rolling "next 7 days" calendar view.** Seen: [Sunsama request](https://roadmap.sunsama.com/improvements/p/feature-request-rolling-7-day-view-in-calendar). **Fit: Medium.**
9. **Paste a list, get many tasks.** Seen: Akiflow's top request, "Batch tasks" (12 votes). Cheap to build. **Fit: Medium-High.**
10. **Public API and webhooks.** Seen: Sunsama API (887 votes). We already have MCP; this is a small extension. **Fit: Medium.**
11. **Custom keyboard shortcuts and macros.** Seen: TickTick board (5 votes). **Fit: Medium.**
12. **Location reminders.** Seen: Things users have asked for years ([TechRepublic](https://www.techrepublic.com/article/things-3-review/)). Background geofencing isn't possible on the web. **Fit: Low.**

## B. New mechanics from 2025–26 launches
13. **Projected finish time.** A live "you'll finish at 5:40pm" based on the remaining list's estimates. Seen: [Llama Life](https://squeezegrowth.com/llama-life-review/). Demand: reviewers say the running total makes time feel real. **Fit: High.**
14. **Visual time-remaining for people who lose track of time.** Countdown blocks on the timeline showing how much of the day is left. Seen: Tiimo, [iPhone App of the Year 2025](https://www.tiimoapp.com/resource-hub/tiimo-winner-2025-app-store-awards). **Fit: High.**
15. **Energy budget.** Tag tasks by effort and show a daily meter that warns when a morning is overloaded. Seen: [Structured Energy Monitor](https://plaky.com/blog/best-daily-planner-apps/). Demand: reviewers say it makes them ask "will I have the energy?", not just "the time?". **Fit: High.**
16. **Suggestions pulled from the backlog.** Surface tasks based on their age, how many times they've been rescheduled, and nearby due dates. Seen: [TickTick 8.0, Jan 2026](https://www.youtube.com/watch?v=aJ0ELyY215A). **Fit: High.**
17. **Gentle decay with a "graveyard".** Tasks left untouched fade out and are archived. You can revive one a day. Seen: [Truc, Dec 2025](https://blog.laurentcharignon.com/post/2025-12-28-truc-todo-app/) (decays after 3 idle days; oldest culled above 15 open tasks) and OneTh1ng. A calm version: fade to Someday and review in the weekly ritual. **Fit: Medium-High.**
18. **Year view with a heatmap.** Shows how busy each day of the year is. Seen: TickTick 8.0. **Fit: High.**
19. **Countdowns to key dates.** Seen: [TickTick Countdown, May 2025](https://www.alternativeto.net/news/2025/5/ticktick-adds-countdown-feature-to-track-important-events-and-deadlines/). **Fit: Medium.**
20. **"Pull, not push" integrations.** Pull items from Gmail, Linear or GitHub into the plan when you choose, instead of having them flood in. Seen: [Juno](https://www.producthunt.com/products/juno-digital-planner), #1 Product of the Day on Product Hunt, Nov 15 2025, 351 upvotes. Its offline-first design was praised. **Fit: Medium.**
21. **Local-first storage plus CalDAV.** Seen: [Show HN local-first planner](https://news.ycombinator.com/item?id=45810856), 88 points and 81 comments. Commenters asked for CalDAV and questioned subscriptions for an offline app. **Fit: Medium-High.**

## C. Delight and retention
22. **Day rating plus highlights, trended over time.** An add-on to our existing evening shutdown. Seen: [Sunsama reviews](https://checkthat.ai/brands/sunsama/reviews). Demand: users say writing "here's what I did" is what makes them stop working. **Fit: High.**
23. **Year in Review ("Wrapped").** Seen: Todoist has done [Year in Review](https://todoist.com/review/2017/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJMTXdXb2ZUbiIsInVpZCI6MTc0MTcsInllYXIiOjIwMTd9.j2KiiLTnbj81HImgzgJs9c91aWK0Dk3Qt2FI6EYXS7A) before; I couldn't confirm a 2025 edition. **Fit: High** (retention every December).
24. **Soft, optional streaks.** Seen: Todoist Karma. Demand: 8–10-year users credit it with keeping them engaged ([Sunrise Digest](https://thesunrisedigest.com/focus/todoist-review-2026/)). **Fit: Medium** (must stay optional for a calm app).
25. **"This Evening" section in Today.** Seen: [Things](https://www.macstories.net/reviews/things-3-beauty-and-delight-in-a-task-manager/). **Fit: High.**
26. **Drag-to-insert add button.** Drag the add button to the spot where the new task should go. Seen: Things "Magic Plus", which reviewers call a delight. **Fit: Medium.**
27. **Smart snooze presets.** "This evening", "In 4 hours", "This weekend". Seen: Todoist users asked for these ([MacStories](https://www.macstories.net/news/todoist-launches-smart-schedule-an-ai-based-feature-to-reschedule-overdue-tasks/)); [Defer](https://www.deferapp.com/support/snooze/) is built around snoozing. **Fit: High.**
28. **Nag until done, opt-in per task.** Seen: [Due](https://appleinsider.com/articles/18/08/29/hands-on-due-3-for-ios-is-a-reminder-app-that-wont-ever-let-you-forget) (auto-snooze every 1–60 minutes; a user called it the best money they ever spent in the App Store). Apple Reminders added "Urgent" alarms in iOS 26.2 and an Urgent list in 26.4 ([9to5Mac](https://9to5mac.com/2026/02/27/ios-26-4-gives-reminders-best-new-feature-the-one-thing-it-was-missing/)). **Fit: Medium.**
29. **Subtle completion celebration.** Seen: Llama Life confetti. **Fit: Medium.**

## D. PWA capabilities in 2026 (with iOS status)
30. **Badging API.** Show today's remaining count on the app icon. iOS 16.4+ and the macOS Sonoma Dock ([WebKit](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/)); the badge only appears after notification permission is granted. **Fit: High.**
31. **Declarative Web Push.** Reminders that display without a service worker. iOS/iPadOS 18.4+ home-screen apps, Safari 18.5+ on macOS ([WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/)). **Fit: High.**
32. **Document Picture-in-Picture.** An always-on-top "Now" card or timer. Chrome/Edge desktop and Firefox 151 (May 2026); no Safari ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API)). **Fit: High** (desktop).
33. **Web Share Target.** Share a link or text from any app into the Inbox. Works in installed Chromium PWAs; **not on iOS** (the WebKit bug [194593](https://bugs.webkit.org/show_bug.cgi?id=194593) is still open). On iOS, offer an Apple Shortcut or email-in instead. **Fit: Medium-High.**
34. **Persistent storage.** Home-screen apps are exempt from Safari's 7-day eviction, and `navigator.storage.persist()` also protects data ([WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)). This is the foundation for local-first. **Fit: High.**
35. **Screen Wake Lock** for focus sessions and rituals. Fixed for home-screen apps in iOS 18.4 ([WebKit](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)). **Fit: Medium.**
36. **Install coaching for iOS 26.** Any site added to the Home Screen now opens as a web app by default ([heise](https://www.heise.de/en/news/iOS-26-and-iPadOS-26-Changed-web-app-behaviour-on-the-home-screen-10749652.html)), which lowers install friction. **Fit: High.**
37. **Chromium-only APIs.** Periodic Background Sync (to pre-build the morning plan), File Handling and Launch Handler (open .ics or .md files), and Idle Detection (auto-pause the timer; Apple and Mozilla have [rejected it](https://alternativeto.net/news/2021/9/google-chrome-94-s-idle-detection-api-rejected-by-mozilla-and-apple-citing-user-surveillance-concerns-)). None work on Safari. **Fit: Low.** Treat them as progressive extras only.

Other iOS gaps: no background sync, File System Access, manifest shortcuts or widgets; notification action buttons are limited.

## Top 10 to add, ranked
1. **Objectives ladder (month, quarter, year) linked to tasks, with a monthly ritual** (#1). The largest unmet demand I found, at 1.7k votes.
2. **Projected finish time plus visual time-remaining** (#13, #14). The most direct "time-aware" win.
3. **Energy budget per task, with a daily meter** (#15).
4. **Per-task miss policy and recurring exceptions** (#4, #5). Routines stop generating guilt.
5. **Smart snooze presets plus a "This Evening" section** (#25, #27).
6. **Planned-vs-actual insights** (#2). Estimate accuracy feeds straight back into our capacity warning.
7. **PWA presence pack: Badging, Declarative Web Push and a Document PiP "Now" card** (#30–32).
8. **Backlog suggestions with gentle decay to Someday** (#16, #17).
9. **Day rating and highlights trend in the shutdown** (#22).
10. **Year heatmap plus Year in Review** (#18, #23).
