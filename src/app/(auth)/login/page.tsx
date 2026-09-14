"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/data/supabase-browser";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("dev@sparehour.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace(params.get("next") ?? "/today");
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input className="rounded-lg border border-line bg-surface px-3 py-2" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input className="rounded-lg border border-line bg-surface px-3 py-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && <p className="text-sm text-deadline">{error}</p>}
      <button className="mt-2 h-11 rounded-lg bg-ink font-medium text-paper disabled:opacity-60" disabled={busy} type="submit">
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-xs text-ink-3">Local dev: dev@sparehour.local / sparehour</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h1 className="font-display text-4xl">Sparehour</h1>
        <p className="mt-1 text-ink-2">Find the spare hours in your day.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
