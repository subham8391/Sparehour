/** What went wrong at sign-in, in the app's words; the server's own message when it has one worth showing. */
export function signInError(message: string | undefined): string {
  if (!message) return "That didn't work. Try again.";
  if (/network|fetch/i.test(message)) return "Couldn't reach Sparehour. Check your connection and try again.";
  if (/expired|invalid/i.test(message)) return "That code didn't work. Check it, or ask for a new one.";
  return message;
}
