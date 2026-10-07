// The first run's frame (ONBOARDING.md "Phone: one step per screen"; DESIGN_SYSTEM.md §4a "Sign-in and
// onboarding steps"): one decision per screen on paper, the serif question and its one sentence, the step's
// body, then the buttons. On a phone they hold the bottom edge above the safe area, full width, the primary
// last where the thumb is; from `sm` they follow the step, right-aligned, in the flow (held at the bottom with no
// paper behind them, a long brain dump would scroll under them).
import type { ReactNode } from "react";

export function WelcomeFrame({ title, lead, children, footer }: { title: string; lead: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-5 pt-10 sm:px-6 sm:pt-16">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-title font-book text-balance text-ink">{title}</h1>
        <p className="text-body-lg text-pretty text-ink-2">{lead}</p>
      </header>
      <section className="flex flex-col gap-4">{children}</section>
      <footer className="sticky bottom-0 z-20 mt-auto -mx-5 flex flex-col gap-2 border-t border-line bg-paper/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:static sm:mx-0 sm:mt-2 sm:flex-row sm:justify-end sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-10 sm:backdrop-blur-none">
        {footer}
      </footer>
    </main>
  );
}

/** With `size="sheet"` (48 px, full width on the phone): the desktop size from `sm`. */
export const FOOTER_BUTTON = "sm:h-9 sm:w-auto sm:text-body";
