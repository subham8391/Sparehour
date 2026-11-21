// Sign-in on the phone (ANDROID_APP_SPEC.md §6, ONBOARDING.md step 1): Google where the auth server offers it, and
// the emailed six-digit code, the same account as on the web either way. This is the container: it asks the auth
// server, and the view (~/auth/sign-in-view.tsx) draws what it is told. On success the session provider takes over
// and this screen goes; whoever signed in, the copy on the phone is checked to be theirs before anything is drawn
// (~/sync/database.tsx).
import { useEffect, useState } from "react";
import { signInProviders, signInWithGoogle } from "~/auth/google-sign-in";
import { googleSignInError, signInError } from "~/auth/sign-in-error";
import { SignInView } from "~/auth/sign-in-view";
import { supabase } from "~/auth/supabase";

export function SignIn() {
  const [google, setGoogle] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Google button is there only when the auth server says the provider is on, as on the web's sign-in page.
  useEffect(() => {
    let live = true;
    void signInProviders().then((offered) => live && setGoogle(offered.google));
    return () => {
      live = false;
    };
  }, []);

  const withGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await signInWithGoogle();
    setBusy(false);
    // Closing the browser is not an error; a session, when there is one, takes this screen away.
    if (result.outcome === "failed") setError(googleSignInError(result.message));
  };
  const send = async (email: string) => {
    const to = email.trim();
    if (!to || busy) return;
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase().auth.signInWithOtp({ email: to, options: { shouldCreateUser: true } });
    setBusy(false);
    if (failed) setError(signInError(failed.message));
    else setSentTo(to);
  };
  const verify = async (code: string) => {
    if (!sentTo || code.trim().length < 6 || busy) return;
    setBusy(true);
    setError(null);
    const { error: failed } = await supabase().auth.verifyOtp({ email: sentTo, token: code.trim(), type: "email" });
    setBusy(false);
    // On success the session provider takes over and this screen goes.
    if (failed) setError(signInError(failed.message));
  };

  return (
    <SignInView
      google={google}
      sentTo={sentTo}
      busy={busy}
      error={error}
      onGoogle={() => void withGoogle()}
      onSend={(email) => void send(email)}
      onVerify={(code) => void verify(code)}
      onAnotherEmail={() => {
        setSentTo(null);
        setError(null);
      }}
    />
  );
}
