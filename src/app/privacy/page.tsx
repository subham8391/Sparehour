// Privacy (Settings › About; ruled 2026-10-06): a short, factual page — where
// your data lives (SYSTEM_DESIGN.md §9.6 data map), what reaches Google and
// your browser's push service, and that export is one click. Readable signed
// in or not; outside the app shell, so nothing syncs here.
import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/ui/brand";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { EYEBROW } from "@/ui/section-label";

export const metadata: Metadata = { title: "Privacy · Sparehour" };

const H2 = "font-display text-pane font-medium text-ink";
const P = "text-body-lg text-pretty text-ink-2";

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-5 py-10 sm:px-8">
      <Wordmark />
      <div className="flex flex-col gap-2">
        <p className={EYEBROW}>Privacy</p>
        <h1 className="font-display text-title font-book text-balance text-ink">Where your plans live</h1>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className={H2}>On your devices</h2>
        <p className={P}>Each device keeps its own copy of your tasks, projects and settings in a local database, so Sparehour works offline. Signing out clears that copy.</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={H2}>In your account</h2>
        <p className={P}>Your account keeps everything in a Postgres database run with Supabase, which also handles signing in. That is what keeps your devices in step.</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={H2}>Google Calendar, if you connect it</h2>
        <p className={P}>
          Sparehour reads your events to work out your free time and keeps a copy with your account. It writes only the time blocks you make, to the one calendar you choose. Disconnecting stops both and
          revokes its access.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={H2}>Reminders</h2>
        <p className={P}>Reminders travel through your browser’s push service (Apple, Google or Mozilla, depending on the browser) to reach your device.</p>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className={H2}>Yours to take or remove</h2>
        <p className={P}>
          Settings › Data exports everything in one click, as JSON, Markdown or CSV. Deleting your account in Settings › Account removes all of it after 30 days; signing in before then brings it back. Your
          data is never sold, and there are no ads.
        </p>
      </section>
      <Link href="/settings#about" className={cx(buttonClass({ variant: "secondary", block: true }), "mt-2 sm:w-auto sm:self-start")}>
        Back to Settings
      </Link>
    </main>
  );
}
