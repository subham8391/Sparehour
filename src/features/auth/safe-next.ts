/** Only a same-origin path may be the destination after sign-in; anything else lands on Today. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/today";
  return next;
}
