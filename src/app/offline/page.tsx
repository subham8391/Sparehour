// Shown by the service worker when a page is requested with no network and
// nothing cached for it (SYSTEM_DESIGN.md §10.1). Your data is on the device;
// the app itself just was not cached yet.
import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 p-8">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Offline</p>
      <h1 className="font-display text-3xl leading-tight text-ink">This page isn&rsquo;t on your device yet.</h1>
      <p className="text-[15px] text-ink-2">Everything you&rsquo;ve done is saved here and will sync when you&rsquo;re back. Today, Inbox and your lists still open.</p>
      <Link href="/today" className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-ink px-4 text-[15px] font-medium text-paper sm:w-auto sm:self-start">
        Open Today
      </Link>
    </main>
  );
}
