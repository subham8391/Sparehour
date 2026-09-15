"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth/login-form";

function LoginFormWithParams() {
  const params = useSearchParams();
  return <LoginForm next={params.get("next")} initialError={params.get("error")} />;
}

export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h1 className="font-display text-4xl">Sparehour</h1>
        <p className="mt-1 text-ink-2">Find the spare hours in your day.</p>
      </div>
      <Suspense>
        <LoginFormWithParams />
      </Suspense>
    </main>
  );
}
