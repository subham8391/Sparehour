// An account waiting for deletion (SYSTEM_DESIGN.md §9.6; ruled 2026-10-06).
// Signed in during the 30 days, the proxy brings every app page here: the date
// it goes and Restore. Signed out (straight after deleting), it says the same
// date and how to change one's mind. Outside the app shell: nothing syncs here.
import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteAfter, deletionDay } from "@/features/account/deletion";
import { RestoreAccount } from "@/features/account/restore-account";
import { createUserScopedClient } from "@/server/auth/supabase";
import { Wordmark } from "@/ui/brand";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { EYEBROW } from "@/ui/section-label";

export const dynamic = "force-dynamic";

export default async function DeletedAccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const marked = user ? deleteAfter(user.app_metadata) : null;
  if (user && !marked) redirect("/today");
  const on = (await searchParams).on;
  const day = deletionDay(marked ?? (typeof on === "string" ? on : null));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-5 py-10 sm:px-8">
      <Wordmark className="mb-4" />
      <p className={EYEBROW}>Account</p>
      <h1 className="font-display text-title font-book text-balance text-ink">{day ? `Your account will be deleted on ${day}.` : "Your account is set to be deleted."}</h1>
      {user ? (
        <>
          <p className="text-body-lg text-pretty text-ink-2">Everything is still here until then. Restore it and carry on where you left off; a connected calendar needs connecting again.</p>
          <RestoreAccount />
        </>
      ) : (
        <>
          <p className="text-body-lg text-pretty text-ink-2">You’re signed out on every device. Changed your mind? Sign in before then and you can restore everything.</p>
          <Link href="/login" className={cx(buttonClass({ variant: "secondary", block: true }), "mt-2 sm:w-auto sm:self-start")}>
            Sign in
          </Link>
        </>
      )}
    </main>
  );
}
