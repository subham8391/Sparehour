// Segment 5 — habit, focus & gamification apps. Source: research/05-users-trends-opportunities.md §6
window.APPS = (window.APPS || []).concat([
  {
    name: "Habitica", seg: "habit",
    tag: "Your tasks as a role-playing game",
    price: "Free · optional subscription", priceMo: null,
    platforms: "Web, iOS, Android",
    f: {
      Organize: ["Habits (+/−), Dailies, To-Dos"],
      Focus: ["XP, levels, gold for real-world rewards", "HP damage for missed Dailies", "Party boss quests, guilds", "Avatar gear, pets, achievements"]
    },
    retention: "Social accountability — your misses hurt your party",
    love: "Fun, social motivation",
    hate: "Bugs; wants widgets & Watch; punitive for some"
  },
  {
    name: "Streaks", seg: "habit",
    tag: "Apple Design Award habit tracker, capped at 24 habits",
    price: "One-time purchase", priceMo: 0,
    platforms: "iPhone, iPad, Mac, Watch, Vision Pro",
    f: {
      Focus: ["Up to 24 habits (deliberate cap)", "Auto-complete from Apple Health", "Flexible schedules (N times/week)", "Streak counter, per-task stats", "Watch complications, widgets"]
    },
    retention: "Loss aversion on the streak + zero-effort Health logging",
    love: "Simple, beautiful, automatic",
    hate: "Streak reset can feel harsh"
  },
  {
    name: "Finch", seg: "habit",
    tag: "Self-care pet that grows when you complete goals",
    price: "Free · Plus subscription", priceMo: null,
    platforms: "iOS, Android",
    f: {
      Focus: ["Virtual pet grows with self-care goals", "Energy powers timed adventures", "Mood tracking, journaling", "Morning check-in loop", "Widget shows pet state", "Friend visits"]
    },
    retention: "Emotional attachment via always-visible widget (D1/D7 54%/37%)",
    love: "Gentle, kind, motivating",
    hate: "—"
  },
  {
    name: "Forest", seg: "habit",
    tag: "A tree grows while you stay off your phone",
    price: "Paid app / in-app", priceMo: null,
    platforms: "iOS, Android, extensions",
    f: {
      Focus: ["Tree dies if you leave the app", "Permanent forest of sessions", "Real trees planted (2M+)", "Deep Focus app blocking", "Plant Together group stakes", "Session tags & analytics"]
    },
    retention: "Visible loss + group stakes + real-world impact",
    love: "60M+ downloads; students love it",
    hate: "—"
  },
  {
    name: "Session", seg: "habit",
    tag: "Intention → focus → reflection Pomodoro for Mac/iOS",
    price: "Free · Pro subscription", priceMo: null,
    platforms: "macOS, iOS, iPadOS",
    f: {
      Focus: ["Declare intention before each session", "Block apps & sites", "Post-session reflection", "End-of-day review", "Slack status sync (Pro)"]
    },
    retention: "A reflection ritual that builds self-review",
    love: "Thoughtful ritual",
    hate: "Apple-only"
  },
  {
    name: "Focusmate", seg: "habit",
    tag: "Live video co-working with a stranger (body doubling)",
    price: "3 free/wk · Plus $8/mo yr", priceMo: 8,
    platforms: "Web",
    f: {
      Focus: ["25 / 50 / 75-minute live sessions", ">99% partner match rate", "Declare tasks, check in at end", "Favourite partners, timeliness score"]
    },
    retention: "Social commitment to a real appointment (28% of users ADHD)",
    love: "'A brain hack' for starting work",
    hate: "—"
  },
  {
    name: "Opal", seg: "habit",
    tag: "Screen-time blocker with commitment devices",
    price: "Free · Pro subscription", priceMo: null,
    platforms: "iPhone, Mac, Android",
    f: {
      Focus: ["Scheduled Focus Rules", "Hard Mode can't be undone mid-session", "Allow-Only mode", "Opal Score, Focus Gems milestones"]
    },
    retention: "Commitment devices + milestone collection",
    love: "Real reduction in screen time",
    hate: "—"
  }
]);
