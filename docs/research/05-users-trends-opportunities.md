# Personal Work Management: market, user-behavior and trend research (as of 2026-09-13)

**Method and limits.** Reddit blocks crawling from these tools, both as a search domain filter and as a fetch target. So the Reddit evidence here is indirect: Reddit posts quoted in third-party write-ups, app-store descriptions that echo Reddit language, and blogs. For first-hand user voice I relied on Hacker News, pulling the high-engagement 2024–2026 threads through the HN Algolia API and reading them in full. The session's web-search quota ran out partway through. As a result, the 2025–26 changes to Microsoft To Do and Google Tasks, and the news for Structured and Amie, are **not verified** here. The pain-point ranking is qualitative: it counts how often each theme came up across the roughly 15 threads and reviews I read.

---

## 1. Market size and dynamics

### Market-size reports: treat as directional only
| Scope | 2025/26 estimate | Source (credibility) |
|---|---|---|
| Task-management software | $4.16B (2025) → $4.71B (2026), 13.3% CAGR; another report: $5.1B → $5.87B, 15.2% CAGR | [Research and Markets](https://www.researchandmarkets.com/reports/5888963/task-management-software-market-global), [The Business Research Co.](https://www.thebusinessresearchcompany.com/report/task-management-software-global-market-report) (paid syndicated reports; medium credibility) |
| Task-management software | $3.94B (2025) → $12.34B by 2033, 15.6% CAGR | [Grand View Research](https://www.grandviewresearch.com/industry-analysis/task-management-software-market-report) (medium) |
| Task-management software (narrow scope) | $1.27B (2025) → $2.66B by 2031, 13.1% CAGR | [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/task-management-software-market) (medium) |
| To-do list apps specifically | $846M–$1.43B (2025), about 8% CAGR; "individuals" segment 44.7% of revenue; "312M monthly users" | [Market Reports World](https://www.marketreportsworld.com/market-reports/to-do-list-apps-market-14722351), [Business Research Insights](https://www.businessresearchinsights.com/market-reports/to-do-list-apps-market-117863), [Verified Market Reports](https://www.verifiedmarketreports.com/product/to-do-list-apps-market/) (**low**: SEO report mills with inconsistent scope) |
| Broader productivity apps | about $12.3B (2025) | [Business of Apps](https://www.businessofapps.com/data/productivity-app-market/), [Fortune Business Insights](https://www.fortunebusinessinsights.com/productivity-apps-market-110254) |

**Takeaway.** Estimates for the same category differ by up to 5x. Company-level figures are a better signal than any of these reports:

- **Todoist** says it has "over 50 million" users ([PR Newswire, Jan 2026](https://www.prnewswire.com/news-releases/introducing-todoist-ramble-ai-that-turns-natural-speech-into-structured-tasks-302666143.html)).
- **Motion** has about $50M ARR as of Aug 2025, per a Sacra estimate ([Sacra](https://sacra.com/c/motion/)). Motion itself says "mid-8-figure ARR, 10,000+ B2B customers" ([BusinessWire](https://www.businesswire.com/news/home/20250905188051/en/Motion-Raises-$60M-at-$550M-Valuation-to-Build-the-Agentic-Work-Suite-for-Businesses)).
- **Akiflow** had $2.5M ARR in Sep 2025, self-reported by the founder ([Startup Founder Stories](https://startupfounderstories.com/stories/nunzio-martinello-akiflow-command-bar-pivot)).
- **Sunsama** had about $1.5M ARR in 2024 with 9 staff, according to Latka ([Latka](https://getlatka.com/companies/sunsama)). Latka is low credibility.
- **Finch**, an adjacent category, is claimed at about $4M/month by a single X post ([X](https://x.com/ArfurRock/status/1924499333929373958)). This is unverified.

The picture: the personal-task segment is a crowded, sub-$1B consumer niche. The money is moving to prosumer and SMB "AI planning" tools priced at $17–$34 per month.

### Funding, acquisitions and shutdowns, 2024–2026
- **Reclaim.ai → Dropbox**, Jul 2024, $40.2M. Reclaim had 320k users across 43k companies ([MarketScreener](https://www.marketscreener.com/quote/stock/DROPBOX-INC-45013534/news/Dropbox-Inc-acquired-Reclaim-ai-Inc-for-40-2-million-47716890/), [GeekWire](https://www.geekwire.com/2024/dropbox-acquires-reclaim-a-calendar-app-that-uses-ai-scheduling-to-boost-productivity/)).
- **Height shut down** on Sep 24, 2025, after announcing it in March. It had raised about $18.3M and billed itself as an "autonomous" AI project-management tool ([AlternativeTo](https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/), [Creativerly](https://www.creativerly.com/height-app-is-shutting-down/)).
- **Motion** raised $60M across Series B, C and C2 in 2025 at a $550M valuation. It pivoted from a personal AI calendar to an "agentic work suite" for SMBs, with "AI Employees" at $29 per seat per month ([Reworked](https://www.reworked.co/the-wire/motion-raises-60m-at-550m-valuation-to-build-the-agentic-work-suite-for-businesses/), [SiliconANGLE](https://siliconangle.com/2025/09/08/motion-lands-38m-funding-expand-agentic-ai-suite-smbs/)).
- **Clockwise shut down** on Mar 27, 2026. Salesforce acqui-hired the team into Agentforce, and **all user data was deleted** ([TechRadar](https://www.techradar.com/pro/salesforce-recuits-team-behind-calendar-app-clockwise-into-agentforce), [Doodle](https://doodle.com/en/clockwise-is-shutting-down-what-to-do-next-in-2026/)).
- **Superlist** (from the Wunderlist founder) has raised about $13.8M (Cherry, EQT). It now sells a Free / $5 / $21 per month AI tier ([Tracxn](https://tracxn.com/d/companies/superlist/__2Bh3T1A16hQIKoqCXSdpWgXBGyAGrl_RlP4k2-fEBbI), [Superlist pricing](https://www.superlist.com/pricing)).
- **Tiimo**, an ADHD visual planner, won Apple's **iPhone App of the Year 2025** ([Tiimo](https://www.tiimoapp.com/resource-hub/tiimo-winner-2025-app-store-awards), [TechCrunch](https://techcrunch.com/2025/12/04/ai-finds-its-way-into-apples-top-apps-of-the-year)).
- **Pattern:** VC-funded tools either pivot to B2B agents (Motion) or get absorbed or shut down (Reclaim, Height, Clockwise). Bootstrapped players survive on lean teams (Sunsama, Akiflow, Finch). Each shutdown adds to users' fear of lock-in.

### Monetization norms
- **Price points (verified on each vendor's page):**
  - Todoist Pro went from $5 to **$7/mo**, and from $48 to **$60/yr**, effective Dec 10, 2025. App Store subscribers are grandfathered on a "Pro Legacy" plan that gets no new features ([Todoist](https://www.todoist.com/help/articles/todoist-pro-pricing-update-in-2025-bxBvHZuJZ)).
  - TickTick Premium is **$49.99/yr** ([TickTick](https://ticktick.com/about/upgrade)). Morgen still cites $35.99, which suggests a recent increase ([Morgen](https://www.morgen.so/blog-posts/todoist-pricing)).
  - Any.do: $4.99/mo billed annually, or $7.99 monthly ([Any.do](https://www.any.do/pricing)).
  - Sunsama: **$17–$22/mo, with no free plan "and doesn't plan to"** ([Sunsama](https://www.sunsama.com/pricing)).
  - Motion: $19–$29 per seat ([Sacra](https://sacra.com/c/motion/)).
  - Tiimo: about $10/mo ([Tiimo App Store](https://apps.apple.com/app/tiimo/id1480220328)).
  - Things: one-time purchase per platform ([Cultured Code](https://culturedcode.com/things/pricing/)).
- **RevenueCat 2026 (productivity category):**
  - 77% of plans are monthly.
  - 22% of trial starts happen after Day 0, the highest delayed-trial rate of any category.
  - Trials of 17–32 days convert at a **42.5%** median, versus 25.5% for trials under 4 days.
  - Hard paywalls deliver about 5x Day-35 conversion ([RevenueCat](https://www.revenuecat.com/state-of-subscription-apps-2026-productivity/), [summary](https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026)).
- **Backlash patterns:**
  - Todoist's roughly 40% monthly increase with "no flagship feature" drew criticism ([Morgen](https://www.morgen.so/blog-posts/todoist-pricing), [alfred_](https://get-alfred.ai/blog/todoist-pricing)).
  - On HN, a local-first planner's €25/yr drew "why is a subscription necessary for a local-first app?" ([HN 45810856](https://news.ycombinator.com/item?id=45810856)).
  - "I'm not interested in another rent payment" ([HN 41925644](https://news.ycombinator.com/item?id=41925644)).
  - Godspeed's $150 per 18 months was called "an order of magnitude too high" ([HN 39756325](https://news.ycombinator.com/item?id=39756325)).
  - Hybrid "lifetime core + optional sync subscription" models are praised ([Influencers-Time](https://www.influencers-time.com/subscription-fatigue-in-2025-why-one-time-buys-dominate/); low-credibility blog, but it matches the HN sentiment).

---

## 2. Why people abandon todo apps, ranked by how often each theme came up

Main sources:
- HN "I tried every todo app and ended up with a .txt file" (**1,402 points, 799 comments**, Aug 2025) ([HN 44864134](https://news.ycombinator.com/item?id=44864134))
- the Zesfy do/due-date thread ([HN 41925644](https://news.ycombinator.com/item?id=41925644))
- the Godspeed launch thread ([HN 39756325](https://news.ycombinator.com/item?id=39756325))
- Ask HN on todo and knowledge management, Jan 2025 ([HN 42661803](https://news.ycombinator.com/item?id=42661803))
- "Notes on Managing ADHD" (633 points) ([HN 45083134](https://news.ycombinator.com/item?id=45083134))
- app-store copy and reviews, and blogs

1. **Backlog bloat, overdue guilt, "TODO bankruptcy."** Stale tasks pile up, red overdue counts cause shame, and the person stops opening the app.
   - One commenter (setopt) describes "TODO bankruptcy" ([HN 44864134](https://news.ycombinator.com/item?id=44864134)).
   - ADHD apps now market against this directly, for example: "Other todo apps punish you with overdue badges, streaks, and red numbers" ([Focus One](https://apps.apple.com/app/apple-store/id6756778795)).
   - ADHD commenters say systems collapse under large backlogs ([HN 45083134](https://news.ycombinator.com/item?id=45083134)).
   - One blogger describes the relief of a "Not Now" list ([Kartick](https://kartick.substack.com/p/how-a-not-now-list-de-stressed-me)).
2. **Setup overhead and "productivity theater."** Tuning the system replaces doing the work. Aurornis spent "as much time… rearranging… as doing actual work", and kilroy123 called complex systems "all procrastinating" ([HN 44864134](https://news.ycombinator.com/item?id=44864134)). More: the ["productivity app graveyard"](https://medium.com/design-bootcamp/the-productivity-app-graveyard-aae4003ce28f), [RollingOut](https://rollingout.com/2025/05/03/productivity-app-trap/), [dev.to](https://dev.to/elevenapril/the-productivity-porn-trap-why-your-2025-plan-needs-less-features-and-more-death-awareness-7oa).
3. **The system doesn't fit how I think, leading to app-hopping.** This was the most common reason in the .txt thread: people want a system that comes "naturally to them", and GTD "requires discipline" (pancakemouse, btilly). One Substack reports switching apps "like underwear" ([Satinek](https://satinek.substack.com/p/the-truth-about-the-best-todo-list)). A vendor blog claims professionals try 3–5 apps in two years and abandon each within weeks ([alfred_](https://get-alfred.ai/blog/why-every-productivity-app-failed); low credibility).
4. **Tasks are disconnected from time and the calendar**, so it's unclear what to do next. "Seeing a list of tasks without seeing your calendar is paralyzing" ([FloHub](https://www.flohub.xyz/insights/best-todo-list-app-2026), [Zapier](https://zapier.com/blog/best-todo-list-apps/)). The Zesfy do-date vs due-date split was welcomed as "a great distinction" ([HN 41925644](https://news.ycombinator.com/item?id=41925644)). TickTick's calendar sync reportedly lags about 15 minutes ([Efficient App](https://efficient.app/apps/ticktick)).
5. **Price hikes and subscription fatigue.** See the Todoist, Godspeed and Zesfy reactions in §1.
6. **Lock-in, data sovereignty and shutdown risk.** Users ask "What if the app goes away? I don't want to lose my stuff", and want to sync through Dropbox or Syncthing and export to Markdown ([HN 39756325](https://news.ycombinator.com/item?id=39756325)). todo.txt is praised as platform-agnostic ([HN 44864134](https://news.ycombinator.com/item?id=44864134)). The Clockwise and Height shutdowns proved the risk is real.
7. **Feature bloat and dense UI.** ChromaticPanic warns of "recreating the same bloat" ([HN 44864134](https://news.ycombinator.com/item?id=44864134)). An ADHD user found Zesfy's controls "way too small" and said "less is more" ([HN 41925644](https://news.ycombinator.com/item?id=41925644)). TickTick is described as "cluttered and old" ([Efficient App](https://efficient.app/apps/ticktick)).
8. **Reminder and notification fatigue.** People stop seeing alerts: "alerts are overrated… interrupted by something that doesn't need attention" (nosianu). The same thread paradoxically asks for "persistent nudging until completion" ([HN 44864134](https://news.ycombinator.com/item?id=44864134)).
9. **Fragmentation across tools.** Information is scattered across multiple apps, and search across them is poor ([HN 42661803](https://news.ycombinator.com/item?id=42661803)). Vendors are responding: Superlist's email and Slack task summarization and Akiflow's integrations inbox ([Superlist](https://www.superlist.com/pricing), [Akiflow MCP](https://product.akiflow.com/help/articles/4302815-akiflow-mcp)).
10. **Platform gaps, mobile parity and sync bugs.** Mobile versions miss desktop features (AiAi, [HN 44864134](https://news.ycombinator.com/item?id=44864134)). Users complain of Mac-only launches ([HN 39756325](https://news.ycombinator.com/item?id=39756325)) and of Habitica tasks not updating ([Play Store summary](https://play.google.com/store/apps/details?id=com.habitrpg.android.habitica&hl=en_US)).
11. **Billing trust.** Some users report unexpected charges ([Trustpilot TickTick](https://www.trustpilot.com/review/ticktick.com)).

A meta-finding from the .txt thread: many experienced users go back to **paper, plain text, org-mode or Things**. Low friction and ownership beat features.

---

## 3. What users wish existed (concrete asks)

- **Separate do, due and start dates**, hiding tasks until their start date. One user said "I won't use a to-do app without a start date" ([HN 39756325](https://news.ycombinator.com/item?id=39756325), [HN 41925644](https://news.ycombinator.com/item?id=41925644)).
- **Automatic backlog pruning** and the ability to "forget tasks without guilt" ([HN 44864134](https://news.ycombinator.com/item?id=44864134)).
- **Gentle but persistent reminders**, and location-based triggers ([HN 44864134](https://news.ycombinator.com/item?id=44864134)).
- **Keep hard-time items (calendar) apart from flexible actions (todo)**, while seeing both together ([HN 44864134](https://news.ycombinator.com/item?id=44864134), [FloHub](https://www.flohub.xyz/insights/best-todo-list-app-2026)).
- **Auto-scheduling** into free time ([Efficient App on TickTick gaps](https://efficient.app/apps/ticktick)).
- **A keyboard-first command palette for dates**, fully rebindable hotkeys, deep links to tasks, AppleScript/JS automation, CalDAV, a focus mode, and hide-completed ([HN 39756325](https://news.ycombinator.com/item?id=39756325)).
- **End-to-end encryption, bring-your-own sync, plain-text or Markdown storage and export** ([HN 39756325](https://news.ycombinator.com/item?id=39756325)).
- **Real cross-platform support**, including Windows, Linux and Android-plus-Mac setups ([HN 39756325](https://news.ycombinator.com/item?id=39756325)).
- **Better widgets and Apple Watch support** (Habitica feedback; Tiimo's award highlighted widgets and Live Activities) ([Tiimo](https://www.tiimoapp.com/resource-hub/tiimo-winner-2025-app-store-awards)).
- **Accountability matchmaking and shared-intention spaces** ([HN 43597425](https://news.ycombinator.com/item?id=43597425)).
- **Tasks readable and writable by AI agents in plain files**, with multi-repo support and Jira/Linear sync ([Backlog.md, HN 44483530](https://news.ycombinator.com/item?id=44483530)).
- **Fair pricing, ideally with a buy-once option** (the HN threads cited above).

---

## 4. Special user segments

**ADHD and neurodivergent users (strongest evidence)**
- *Visual time and AI breakdown.* Tiimo turns to-dos into visual timelines with AI step breakdown and time estimates, a focus timer, widgets and Live Activities, and mood and energy check-ins ([Tiimo](https://www.tiimoapp.com/resource-hub/tiimo-winner-2025-app-store-awards)).
- *Body doubling.* Focusmate has hosted 5M+ sessions; 28% of its users have an ADHD diagnosis and more than a third identify as neurodivergent ([Reasons to be Cheerful](https://reasonstobecheerful.world/the-surprising-perks-of-virtual-coworking-with-strangers/)). It also self-reports a 161% productivity lift ([FAQ](https://www.focusmate.com/faq/); a vendor survey, low rigor). The HN body-doubling thread drew 365 points; one user does 500+ Focusmate sessions a year and calls it "some kind of brain hack" ([HN 43597425](https://news.ycombinator.com/item?id=43597425)). A "Shimmer ADHD body doubling" Show HN drew 116 points ([HN 42009087](https://news.ycombinator.com/item?id=42009087)).
- *Gentle handling of overdue tasks.* Features like a "Too Hard Right Now" button, "no streaks, no guilt mechanics", and sorting by importance × resistance ([Focus One](https://apps.apple.com/app/apple-store/id6756778795)).
- *Low density, because feature-rich overwhelms* ([HN 41925644](https://news.ycombinator.com/item?id=41925644)).
- *Realism.* HN commenters say medication "unlocked" their todo and Pomodoro systems ([HN 45083134](https://news.ycombinator.com/item?id=45083134)). Apps should assist task initiation, not assume discipline.

**Developers and knowledge workers**
- They are drawn to speed and a keyboard-first design: Godspeed's launch drew 328 points ([HN 39756325](https://news.ycombinator.com/item?id=39756325)), and a 278 KB native C todo app drew 386 points ([HN 43954649](https://news.ycombinator.com/item?id=43954649)).
- They want Markdown-in-git and agent-readable tasks. Backlog.md drew 254 points; its creator says agent success rates jumped from 50% to over 95% when features were broken into markdown task files ([HN 44483530](https://news.ycombinator.com/item?id=44483530)).
- CLI tools keep appearing (Omm, Tascli; [HN 41007422](https://news.ycombinator.com/item?id=41007422), [HN 46176533](https://news.ycombinator.com/item?id=46176533)), and org-mode and todo.txt stay popular ([HN 44864134](https://news.ycombinator.com/item?id=44864134)).

**Students** (thin evidence)
- Focus gamification dominates: Forest has 60M+ downloads and session tags such as Study and Writing ([Forest](https://www.forestapp.cc/)).
- Other needs are inferred: price sensitivity, syllabus and deadline import, and exam-countdown views.

**Freelancers** (inferred, not researched in depth)
- Task-linked time tracking and billable exports.
- Slack status sync while focusing, which Session offers ([Session](https://www.stayinsession.com/)).
- Per-client projects.

**Managers**
- GTD "Waiting For" lists for delegated items ([Todoist GTD](https://www.todoist.com/productivity-methods/getting-things-done)).
- Shared lists, because "todos are often collaborative" ([HN 39756325](https://news.ycombinator.com/item?id=39756325)).
- Meeting transcripts turned into action items (Akiflow Meeting Assistant via MCP, Superlist AI Meeting Notes) ([Akiflow](https://product.akiflow.com/help/articles/4302815-akiflow-mcp), [Superlist](https://www.superlist.com/pricing)).
- Also inferred: per-person 1:1 agenda lists.

---

## 5. Trends for 2025–2026

| Trend | Evidence | User sentiment |
|---|---|---|
| **MCP servers and agent access** | Todoist's first-party MCP at `ai.todoist.net/mcp` works with Claude, Claude Code, ChatGPT, Codex and Gemini, and there is also a Todoist CLI ([Todoist](https://www.todoist.com/help/articles/connect-todoist-to-an-ai-assistant-WEeLx9d8h), [Claude Code guide](https://www.todoist.com/help/articles/use-claude-code-with-todoist-cli-and-mcp-b1USJ4HB3)). TickTick has a first-party MCP covering tasks and habits ([usecarly](https://www.usecarly.com/blog/claude-ticktick-integration/); TickTick's own help page wouldn't load for me). Akiflow's MCP works with Claude, ChatGPT, Cursor and Windsurf and was #4 on Product Hunt ([Akiflow](https://product.akiflow.com/help/articles/4302815-akiflow-mcp)). Sunsama includes MCP in its Pro plan ([Sunsama](https://www.sunsama.com/pricing)). | This is becoming table stakes, and power users like it. One limitation: MCP only runs inside a session the user starts, so there is no background agent ([usecarly](https://www.usecarly.com/blog/claude-sunsama-integration/)). |
| **Voice and brain-dump capture** | Todoist Ramble had 76k users and about 290k sessions in its first 3 weeks of beta. It went GA on Jan 21, 2026, in 38 languages, on Gemini 2.5 Flash Live ([PR Newswire](https://www.prnewswire.com/news-releases/introducing-todoist-ramble-ai-that-turns-natural-speech-into-structured-tasks-302666143.html)). Superlist includes Voice AI in its $5 tier. | This is the clearest AI feature with pull. It solves capture friction. |
| **AI planning and breakdown** | Tiimo won App of the Year for AI breakdown and time estimates. Apple Reminders now auto-categorizes and suggests reminders from Mail and Safari ([Apple](https://support.apple.com/guide/iphone/use-apple-intelligence-in-reminders-iphcb580b580/ios)). | Welcome when it makes planning more realistic. |
| **Agentic execution** | Motion's "AI Employees" ([Sacra](https://sacra.com/c/motion/)). Height's "autonomous PM" still shut down. | Mixed. Money is flowing to B2B, but there's little consumer evidence yet. |
| **AI fatigue** | Nielsen Norman Group's State of UX 2026 report finds fatigue with "rushed" AI ([DesignRush](https://news.designrush.com/ai-fatigue-product-teams)). Consumer excitement is down 7%, and 81% want AI content labeled ([MarTech](https://martech.org/ai-use-and-fatigue-growing-among-consumers/)). The Todoist price hike was framed as paying for AI ([Morgen](https://www.morgen.so/blog-posts/todoist-pricing)). | Users resent paying for AI they didn't ask for. Opt-in, labeled, reversible AI wins. |
| **Local-first and sync engines** | HN interest is high: "Local-first software" 883 points (2025 repost), "Linear sent me down a local-first rabbit hole" 467, "Why haven't local-first apps become popular?" 505 points and 485 comments ([HN 44473135](https://news.ycombinator.com/item?id=44473135), [HN 44833834](https://news.ycombinator.com/item?id=44833834), [HN 45333021](https://news.ycombinator.com/item?id=45333021)). Automerge 3.0 claims about 10x lower memory use ([debugg.ai](https://debugg.ai/resources/local-first-apps-2025-crdts-replication-edge-storage-offline-sync)). | Developers love it. The skeptics cite the business model and sync complexity, and note that "last-write-wins plus an audit trail handles 95%" of cases. |
| **Privacy and E2E** | Requested for regulated work ([HN 39756325](https://news.ycombinator.com/item?id=39756325)). | A niche, but a loyal one. |
| **Calendar and task convergence** | Todoist's two-way Google and Outlook calendar sync ([Zapier](https://zapier.com/blog/best-todo-list-apps/)); Reclaim → Dropbox; Clockwise's death; Sunsama and Akiflow built on this idea. | Strong demand. Sync latency is a known weak spot (TickTick). |
| **Habit and task convergence** | TickTick bundles habits and Pomodoro, and its MCP exposes habit streaks. | Seen as good value compared with Todoist ([alfred_](https://get-alfred.ai/blog/todoist-pricing)). |
| **Widgets, Live Activities, Watch** | Featured in Tiimo's award; Finch's widget drives retention ([Deconstructor of Fun](https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl)); Habitica users ask for it. | Consistently appreciated. |
| **Universal inbox** | Superlist email and Slack summarization; Akiflow integrations; Apple suggests reminders from Mail. | Wanted, with a caveat: users fear yet another inbox. |

---

## 6. Habit, focus and gamification apps (adjacent inspiration)

**Habitica** ([Trophy case study](https://trophy.so/blog/habitica-gamification-case-study))
- Features:
  - Three task types: Habits (+/−), Dailies, To-Dos.
  - XP and levels for completing tasks.
  - Gold currency spent on gear or on self-defined real-world rewards.
  - HP damage when Dailies are missed.
  - Parties with collaborative boss quests; missing Dailies hurts party members.
  - Guilds (communities).
  - Avatar customization, equipment, pets and mounts.
  - Achievements and badges.
  - No competitive leaderboards, by design.
- Retention mechanic: **social accountability.** Party quests make your failures cost your friends. Users report bugs and want widgets and a Watch app ([Play](https://play.google.com/store/apps/details?id=com.habitrpg.android.habitica&hl=en_US)).

**Streaks** ([streaksapp.com](https://streaksapp.com/))
- Features:
  - Up to 24 tracked tasks. The cap is deliberate.
  - Automatic completion from Apple Health data (steps, heart rate, running distance).
  - Flexible schedules: specific weekdays, or N times per week.
  - Streak counter that resets to zero on a miss.
  - Per-task statistics.
  - Apple Watch complications and widgets.
  - Runs on iPhone, iPad, Mac, Watch and Vision Pro. It is an Apple Design Award winner.
- Retention mechanic: **loss aversion on the streak counter**, plus zero-effort logging through Health.

**Finch** ([Deconstructor of Fun](https://www.deconstructoroffun.com/blog/x0hd2ssr80y5n7gv0w967pg7hwd7tl), [Sparrow](https://blog.sparrowapps.io/p/finch-how-a-self-care-app-hit-30m-arr-without-vc-money))
- Features:
  - A virtual pet that grows as you complete self-care goals.
  - Energy earned from tasks powers timed "adventures".
  - Mood tracking and journaling.
  - Morning check-in that starts the daily loop.
  - Outfits and room decor unlocked as rewards.
  - Home-screen widget showing the pet's state.
  - Friend visits as random surprises.
  - Web monetization: sponsor subscriptions for others, pay-what-you-want.
- Retention mechanic: **emotional attachment to a companion that is always visible on the widget**, rather than push notifications. Reported D1/D7 retention is 54%/37%, versus Duolingo's 51%/35%, with about 10M MAU (estimates).

**Forest** ([forestapp.cc](https://www.forestapp.cc/))
- Features:
  - A tree grows during a focus session and dies if you leave the app.
  - Completed trees join a permanent forest.
  - Coins pay for real trees through Trees for the Future (2M+ planted).
  - Deep Focus app blocking.
  - Time Guard scheduled blocking.
  - Plant Together: if one person quits, everyone's tree dies.
  - Session tags and analytics.
  - 60M+ downloads.
- Retention mechanic: **visible loss (a dead tree) plus group stakes**, with a real-world impact reward.

**Session** ([stayinsession.com](https://www.stayinsession.com/))
- Features:
  - State an intention before each session.
  - Block apps and websites on macOS, in Safari, Chrome, Brave and Edge.
  - Post-session reflection prompt ("what did you learn").
  - End-of-day review of progress.
  - Slack status sync (Pro).
  - Runs on macOS, iOS and iPadOS.
- Retention mechanic: **an intention → focus → reflection ritual** that builds a self-review habit.

**Focusmate** ([FAQ](https://www.focusmate.com/faq/))
- Features:
  - Live 25, 50 or 75-minute video coworking sessions with a stranger.
  - More than 99% of bookings get a partner.
  - Declare your tasks at the start, check in at the end.
  - Mark favorite partners.
  - A timeliness score, with account freezes for no-shows.
  - 3 free sessions per week; Plus costs $8/mo billed yearly or $12 monthly.
- Retention mechanic: **social commitment to a scheduled appointment with a real person.**

**Opal** ([opalapp.com](https://opalapp.com/))
- Features:
  - Focus Rules for scheduled app blocking.
  - Focus Timer that locks you in.
  - Hard Mode, which can't be turned off mid-session.
  - Allow-Only mode.
  - Opal Score, combining sleep, focus and rest.
  - Focus Gems: 20+ milestone badges for focus hours and streaks.
  - Friend invites.
  - Runs on iPhone, Mac and Android.
  - Claims 1h 23m saved per day and 150k ratings.
- Retention mechanic: **commitment devices (Hard Mode) plus milestone collection.**

**Lessons for a task app.** Companions and widgets outperform punitive mechanics. Social commitment (Focusmate, Plant Together) is the strongest driver of task initiation. Streaks work but need forgiveness for ADHD users, and Habitica's HP damage is the mechanic to avoid by default.

---

## 7. Methodologies to support natively

Several of these have primers on Todoist's methods hub ([Todoist methods](https://www.todoist.com/productivity-methods)).

| Method | One line | What the app needs |
|---|---|---|
| **GTD** | Capture everything, clarify, organize by next action and context, review weekly ([Todoist GTD](https://www.todoist.com/productivity-methods/getting-things-done)) | Universal inbox, a "clarify" triage flow, projects plus next-action flag, context tags, Waiting For with person and follow-up date, Someday/Maybe, defer or start dates |
| **Weekly Review** | Weekly reset: empty inboxes, review projects, update lists | Guided review wizard, stale-task and stalled-project detection, "no next action" warnings, a summary of what was completed and what slipped |
| **Eisenhower Matrix** | Sort by urgent × important | 2×2 view driven by due proximity and priority, drag between quadrants, a Delegate quadrant linked to Waiting For |
| **Time blocking** | Assign work to calendar blocks | Two-way calendar sync, drag task to calendar, duration estimates, a block turning into a focus session |
| **Timeboxing** | A fixed time budget per task, then stop | Per-task time cap, a timer that alerts on overrun, estimated-vs-actual tracking |
| **Pomodoro** | 25/5 work and break cycles | Built-in timer tied to tasks, Live Activity or Watch, session logs, optional app blocking |
| **Eat the Frog** | Do the hardest task first | "Frog" flag, which pins it to the top of Today and to the morning slot, plus resistance or effort rating |
| **1-3-5 rule** | Each day, 1 big, 3 medium and 5 small tasks | Size field (S/M/L) and a daily planner with 1/3/5 slots |
| **Ivy Lee** | Each evening, list the top 6 for tomorrow in order; carry over what's unfinished | Evening planning ritual, a 6-item ranked list, auto-carryover |
| **Kanban and WIP limits** | Visualize flow and cap work in progress | Board view with custom columns, WIP limits with warnings, cycle-time stats |
| **PARA** | Organize by Projects, Areas, Resources, Archive | Four top-level containers, linked notes or resources on tasks, one-click archive |
| **MoSCoW (Must/Should/Could/Won't)** | Priority by necessity | A 4-level priority set, with "Won't" as a guilt-free parking state |
| **Bullet Journal migration** | Manually re-copy unfinished tasks, which forces a decide/drop choice | Daily or monthly "migrate" ritual: each overdue task must be moved, scheduled or struck. This is the antidote to overdue guilt. |

**Design implication.** Ship these as **switchable views and rituals over one data model** (priority, size, effort, context, do/due/start dates, estimate, waiting-on), not as separate apps. Pain point #2 (setup overhead) argues for templates that work out of the box.

---

## 8. Top 15 opportunities for a new personal work management app

1. **A guilt-free backlog engine.** Replace red overdue counts with a daily "reset" that asks, per task: Today / Reschedule / Someday / Drop (Bullet Journal migration, done automatically). Add a "Too hard right now" defer, automatic aging of untouched tasks into Someday, and a one-tap "declare bankruptcy, keep the archive" option. *Evidence:* pain point #1, the Focus One positioning, HN "TODO bankruptcy".
2. **Do, due and start dates as first-class fields**, with start dates hiding tasks until they're relevant. *Evidence:* "I won't use a to-do app without a start date", and the Zesfy thread's reception.
3. **A capacity-aware Today.** Time estimates plus calendar free time give an explicit "you've planned 9h into 4h free" warning and a visual timeline like Tiimo's. *Evidence:* pain point #4, Tiimo's App of the Year.
4. **Calendar-native time blocking with near-instant two-way sync** (Google, Outlook, CalDAV). Win on sync latency, where TickTick is criticized. Reclaim's exit and Clockwise's death leave an independent, consumer-priced gap.
5. **Zero-setup defaults plus methodology templates.** Open with a working inbox → today → review loop, and make GTD, Eisenhower, 1-3-5, Ivy Lee and Kanban toggleable views over the same data. This directly counters setup fatigue while serving methodology enthusiasts.
6. **Frictionless capture everywhere:** a voice brain-dump that becomes structured tasks, the share sheet, email forwarding, a global hotkey, a Watch app, and Siri/Shortcuts. *Evidence:* Ramble's 76k users in 3 weeks. Capture is where AI earns its keep.
7. **A commitments inbox from Gmail, Slack, GitHub, Jira and Linear.** It should be triage-first (accept or dismiss), de-duplicated, and link back to the source rather than mirroring it. *Evidence:* the fragmentation pain; Superlist and Akiflow moving here.
8. **Agent-ready from day one:** a first-party remote MCP server, a CLI and a public API. Differentiate on **scoped permissions** (read-only, or propose-then-approve), an **agent activity log with undo**, and "assign to agent" tasks. *Evidence:* Todoist, TickTick, Akiflow and Sunsama all shipped MCP in 2025–26, and Backlog.md's traction. Trust features are still missing across the market.
9. **AI that plans rather than chats, and is always opt-in, labeled and reversible:** breaking down vague tasks, estimating duration, suggesting a daily plan, summarizing the weekly review. Don't tie a price hike to it. *Evidence:* AI-fatigue data, and the reaction to Todoist's increase.
10. **Local-first speed, offline use, optional E2E, and an "exit guarantee":** continuous Markdown/JSON/todo.txt export, plus a public promise about what happens to data if the company dies. *Evidence:* Godspeed thread asks, the HN local-first threads, and Clockwise deleting user data.
11. **Fair pricing:** a genuinely useful free tier, about $5/mo billed annually, and a **one-time "local-only" license** with sync as an optional subscription. Use 17–32-day trials and grandfather early users. *Evidence:* RevenueCat trial data, and the Todoist, Godspeed and Zesfy backlash.
12. **A neurodivergent-friendly mode:** low-density layout, visual countdowns, one-thing-now focus view, forgiving streaks (freeze days), energy-based sorting, and **built-in body doubling** (scheduled paired sessions or live co-working rooms). *Evidence:* Tiimo, Focusmate's ADHD share, the HN body-doubling thread.
13. **Glanceable surfaces as a core feature:** interactive widgets, Live Activities for the current block or timer, Watch complications, and the lock screen, with an optional Finch-style companion that reflects progress. *Evidence:* Finch's widget-driven D1/D7 retention, Tiimo's award, Habitica requests.
14. **Delegation and review workflows:** Waiting For with automatic follow-up nudges, per-person 1:1 agenda lists, meeting-notes-to-action-items, and a guided weekly review that flags stalled projects. *Evidence:* the GTD model, Akiflow and Superlist meeting features, and "todos are often collaborative".
15. **One loop for habits, focus and time:** habits, Pomodoro/focus sessions with optional app blocking, and estimated-vs-actual time on the same task objects, with a billable export for freelancers. Gamification stays gentle and non-punitive, with Habitica-style HP loss off by default. *Evidence:* TickTick's bundle being valued above Todoist's, and Forest's, Session's and Opal's mechanics.

**Evidence gaps to close next:**
- direct Reddit sentiment, which needs manual browsing
- 2025–26 changes to Microsoft To Do and Google Tasks
- Structured and Amie news
- Things' exact USD prices and OmniFocus pricing (both vendor pages failed to load)
- first-hand research on students and freelancers
