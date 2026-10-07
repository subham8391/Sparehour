"use client";
// The account's picture (SCREENS.md §18 Account): the sign-in provider's
// photo when there is one (users.avatar_url, filled from Google by the
// database), else the initials. A picture that fails to load falls back to the
// initials too. Decorative: the name beside it says who it is.
import { useState } from "react";
import { cx } from "@/ui/cx";
import { initials } from "./identity";

export function Avatar({ url, name, email, className }: { url: string | null | undefined; name: string | null | undefined; email: string | null | undefined; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const box = cx("grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-body font-medium text-ink-2 select-none", className);
  if (url && broken !== url) {
    return (
      <span className={box} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- a 40 px remote picture; next/image would need every provider's host allow-listed */}
        <img src={url} alt="" width={40} height={40} referrerPolicy="no-referrer" decoding="async" className="size-full object-cover" onError={() => setBroken(url)} />
      </span>
    );
  }
  return (
    <span className={box} aria-hidden="true" data-testid="avatar-initials">
      {initials(name, email) || "·"}
    </span>
  );
}
