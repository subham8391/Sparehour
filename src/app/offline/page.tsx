// Shown by the service worker when a page is requested with no network and
// nothing cached for it (SYSTEM_DESIGN.md §10.1). Your data is on the device;
// the app itself just was not cached yet. The empty-state voice: a fact, one
// sentence, one action.
import Link from "next/link";
import { Wordmark } from "@/ui/brand";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { EYEBROW } from "@/ui/section-label";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-5 py-10 sm:px-8">
      <Wordmark className="mb-4" />
      <p className={EYEBROW}>Offline</p>
      <h1 className="font-display text-title font-book text-balance text-ink">This page isn&rsquo;t on your device yet.</h1>
      <p className="text-body-lg text-pretty text-ink-2">Everything you&rsquo;ve done is saved here and will sync when you&rsquo;re back. Today, Inbox and your lists still open.</p>
      <Link href="/today" className={cx(buttonClass({ variant: "primary", block: true }), "mt-2 sm:w-auto sm:self-start")}>
        Open Today
      </Link>
    </main>
  );
}
