"use client";
// Sign-in as the first impression (DESIGN_SYSTEM.md §4a): one focused card
// on paper with the lockup, the one sentence, and the form. Anchored to the
// top on a phone so the field does not jump when the keyboard opens.
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";
import { Wordmark } from "@/ui/brand";

function LoginFormWithParams() {
  const params = useSearchParams();
  return <LoginForm next={params.get("next")} initialError={params.get("error")} />;
}

export default function LoginPage() {
  return (
    // The card stays (DECISIONS.md), but on a phone it fills the screen so the one decision sits on the bottom edge (§4a).
    <main className="flex flex-1 flex-col items-center px-5 pt-14 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:justify-center sm:px-6 sm:py-10">
      <div className="flex w-full max-w-sm flex-1 flex-col gap-6 rounded-xl border border-line bg-surface p-6 sm:flex-none sm:p-8">
        <div className="flex flex-col gap-2.5">
          <Wordmark as="h1" size="lg" />
          <p className="text-body-lg text-pretty text-ink-2">Find the spare hours in your day.</p>
        </div>
        <Suspense>
          <LoginFormWithParams />
        </Suspense>
      </div>
    </main>
  );
}
