const UNREACHABLE = "Couldn't reach Sparehour. Check your connection and try again.";
const DEFAULT = "That didn't work. Try again.";

/** What went wrong at sign-in, in the app's words; the server's own message when it has one worth showing. */
export function signInError(message: string | undefined): string {
  if (!message) return DEFAULT;
  if (/network|fetch/i.test(message)) return UNREACHABLE;
  if (/expired|invalid/i.test(message)) return "That code didn't work. Check it, or ask for a new one.";
  return message;
}

/** The same for a Google sign-in, where there is no emailed code to speak of: the auth server's reason, as the web's sign-in page shows it. */
export function googleSignInError(message: string | undefined): string {
  if (!message) return DEFAULT;
  if (/network|fetch/i.test(message)) return UNREACHABLE;
  return message;
}
