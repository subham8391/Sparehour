"use client";
// Storage full (SCREENS.md §21 "Quota / storage full"): a banner at the top of every screen with Export your data
// first, then what to do about it. The app keeps working from what is already stored; the banner only says why a new
// change may not stick on this device. A lazy island: the shell mounts it only once quota.ts reports the storage full.
import Link from "next/link";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";

export default function StorageFull() {
  return (
    <section
      role="alert"
      aria-label="Storage full"
      className="mx-4 mt-4 flex flex-col gap-3 rounded-xl border border-deadline-line bg-surface px-4 py-3 text-body-sm text-ink-2 sm:mx-6 md:mx-10"
    >
      <p className="text-body font-medium text-pretty text-ink">This device is out of room for Sparehour.</p>
      <Link href="/settings#data" className={cx(buttonClass({ variant: "secondary" }), "w-full sm:w-auto sm:self-start")}>
        Export your data
      </Link>
      <p className="text-pretty">
        Everything you can see is still here and in your account, but a new change may not save on this device until there is space. After exporting, free some room:
        remove apps or files you no longer need, or clear other websites’ data in your browser’s settings, then reload Sparehour.
      </p>
    </section>
  );
}
