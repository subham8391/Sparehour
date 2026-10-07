// Settings › About › What's new (SCREENS.md §18; ruled 2026-10-06: a short
// changelog in plain words, written from what shipped). Newest first; add an
// entry when something a person would notice ships.

export interface ChangelogEntry {
  /** YYYY-MM-DD */
  date: string;
  items: readonly string[];
}

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-10-07",
    items: [
      "Clear the slate offers Today only or Today plus the backlog, and every batch can come back from Settings › Data.",
      "Archived and dropped tasks can be deleted for good from Settings › Data.",
      "Your account can be deleted from Settings › Account, with 30 days to change your mind.",
      "Settings › Account shows your picture and how you sign in.",
      "On iPhone and iPad, Settings shows the three taps that put Sparehour on your Home Screen.",
    ],
  },
  {
    date: "2026-10-06",
    items: [
      "Settings has a section for each part of your day, with Planning defaults, reminder timing and reduced motion.",
      "Upcoming is a week planner with each day’s capacity.",
      "Break a long task into a project, trim an overfull day, and sort Today your way.",
    ],
  },
  {
    date: "2026-10-01",
    items: ["Plan my day suggests where today’s tasks fit around your meetings."],
  },
  {
    date: "2026-09-28",
    items: ["Finished tasks leave the Logbook a week after you finish them; Export keeps everything."],
  },
  {
    date: "2026-09-27",
    items: ["The first open of the day asks what to do with anything carried over."],
  },
  {
    date: "2026-09-15",
    items: ["Google Calendar: your meetings shape your free time, and time blocks go back to the calendar you choose.", "Sign in with an emailed code or with Google."],
  },
];
