// Who is signed in, as Settings › Account shows it (SCREENS.md §18: "Name,
// email, avatar"): the initials that stand in for a missing picture.

/** Up to two letters for the avatar: first and last name, else the email's first letter. */
export function initials(name: string | null | undefined, email: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = (w: string | undefined) => (w ? (Array.from(w)[0] ?? "") : "");
  if (words.length > 0) return (first(words[0]) + (words.length > 1 ? first(words[words.length - 1]) : "")).toUpperCase();
  return first((email ?? "").trim()).toUpperCase();
}
