"use client";
// Sign-in (ONBOARDING.md step 1, DECISIONS.md Q25): Google, or an emailed
// code. The email carries a six-digit code and a link — the code works on any
// device, the link on the one that asked (it lands on /auth/callback). Google
// is identity only; calendar scopes are asked for later, in Settings. A
// password form stays for the local dev account and the test suite.
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/data/supabase-browser";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { GOOGLE_MARK, GOOGLE_MARK_VIEWBOX } from "./google-mark";
import { fetchSignInProviders } from "./providers";
import { safeNext } from "./safe-next";

const FIELD = "flex flex-col gap-1.5 text-body-sm font-medium text-ink-2";
/** The form fills the card on a phone, so the one decision can sit on the bottom edge (DESIGN_SYSTEM.md §4a). */
const FORM = "flex w-full flex-col gap-4 max-sm:flex-1";
/** Everything below the fields: on a phone it is pushed to the bottom of the card, above the safe area. */
const TAIL = "flex flex-col gap-4 max-sm:mt-auto max-sm:pt-4";

/** Supabase's messages in the app's voice; anything unknown is shown as it came. */
function plain(message: string): string {
  if (/expired|invalid/i.test(message) && /token|otp|code/i.test(message)) return "That code didn't match. Check the newest email, or send another.";
  // The auth server's per-address wait between emails ("For security purposes, you can only request this after 42 seconds.").
  const wait = /after (\d+) seconds?/i.exec(message);
  if (wait) return `You can send another code in ${wait[1]} seconds.`;
  // The project's hourly email allowance, not this person's tries: a minute won't fix it.
  if (/email rate limit/i.test(message)) return "We've sent too many emails for now. Use the code from the last one, or try again later.";
  if (/rate limit|too many/i.test(message)) return "Too many tries for now. Give it a minute.";
  if (/invalid login credentials/i.test(message)) return "That email and password don't match.";
  return message;
}

export function LoginForm({ next, initialError = null }: { next: string | null; initialError?: string | null }) {
  const router = useRouter();
  const destination = safeNext(next);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "code" | "password">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  /** Confirms "Send another": without it the screen looked the same whether or not a new email went out. */
  const [notice, setNotice] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);

  useEffect(() => {
    let live = true;
    fetchSignInProviders().then((p) => {
      if (live) setGoogle(p.google);
    });
    return () => {
      live = false;
    };
  }, []);

  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`;

  const run = async (work: () => Promise<{ error: { message: string } | null }>, then?: () => void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await work();
    setBusy(false);
    if (error) {
      setError(plain(error.message));
      return;
    }
    then?.();
  };

  const sendCode = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () =>
        supabaseBrowser().auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: callbackUrl(),
            // A first sign-in provisions the account; the trigger reads the zone from here.
            data: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
          },
        }),
      () => {
        if (step === "code") setNotice("Sent a new code. Use the newest email.");
        setStep("code");
      },
    );
  };

  const verifyCode = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () => supabaseBrowser().auth.verifyOtp({ email, token: code.trim(), type: "email" }),
      () => router.replace(destination),
    );
  };

  const signInWithPassword = (e: FormEvent) => {
    e.preventDefault();
    void run(
      () => supabaseBrowser().auth.signInWithPassword({ email, password }),
      () => router.replace(destination),
    );
  };

  const signInWithGoogle = () => {
    void run(() => supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl() } }));
  };

  const alert = error && (
    <p role="alert" className="text-body-sm text-pretty text-deadline">
      {error}
    </p>
  );

  if (step === "code") {
    return (
      // Keyed so the step change remounts the form and the code field takes focus.
      <form key="code" onSubmit={verifyCode} className={FORM}>
        <p className="text-body text-pretty text-ink-2">
          We sent a code to <strong className="font-medium text-ink">{email}</strong>. The email has a link too; either works once.
        </p>
        <label className={FIELD}>
          Code
          <Input className="tracking-[0.3em] num" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus required />
        </label>
        {alert}
        {notice && (
          <p role="status" className="text-body-sm text-pretty text-ink-2">
            {notice}
          </p>
        )}
        <div className={TAIL}>
          <Button type="submit" variant="primary" block disabled={busy || code.length < 6}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <div className="-ml-2 flex flex-wrap items-center gap-1">
            <Button variant="link" className="text-ink-2" onClick={sendCode} disabled={busy}>
              Send another
            </Button>
            <Button
              variant="link"
              className="text-ink-2"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setNotice(null);
              }}
            >
              Use a different email
            </Button>
          </div>
        </div>
      </form>
    );
  }

  const usingPassword = step === "password";
  return (
    <form key="email" onSubmit={usingPassword ? signInWithPassword : sendCode} className={FORM}>
      {/* The fast path first when the server offers it; the filled button stays the house path. */}
      {google && !usingPassword && (
        <>
          <Button variant="secondary" block onClick={signInWithGoogle} disabled={busy}>
            <GoogleMark />
            Continue with Google
          </Button>
          <div aria-hidden="true" className="flex items-center gap-3 text-label text-ink-3">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <label className={FIELD}>
        Email
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" enterKeyHint={usingPassword ? "next" : "send"} required />
      </label>
      {usingPassword && (
        <label className={FIELD}>
          Password
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
      )}
      {alert}
      <div className={TAIL}>
        <Button type="submit" variant="primary" block disabled={busy}>
          {busy ? "One moment…" : usingPassword ? "Sign in" : "Email me a code"}
        </Button>
        <Button
          variant="link"
          className="-ml-2 self-start text-ink-2"
          onClick={() => {
            setStep(usingPassword ? "email" : "password");
            setError(null);
          }}
        >
          {usingPassword ? "Email me a code instead" : "Use a password"}
        </Button>
        {!usingPassword && <p className="text-body-sm text-pretty text-ink-3">We&rsquo;ll email a six-digit code and a link. Either works once.</p>}
      </div>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox={GOOGLE_MARK_VIEWBOX} className="shrink-0">
      {GOOGLE_MARK.map((shape) => (
        <path key={shape.fill} fill={shape.fill} d={shape.d} />
      ))}
    </svg>
  );
}
