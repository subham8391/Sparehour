"use client";
// The inline error state (SCREENS.md §21 "Unexpected failure"): what happened in plain words, then Try again and
// Copy details — never a blank screen, never a stack trace, never "Something went wrong" alone. One panel for every
// failure: the route boundaries (app/(app)/error.tsx, app/global-error.tsx), a pane that failed in place
// (`PaneBoundary`) and storage that will not open (features/pwa/storage-error.tsx).
import { useState } from "react";
import { Button } from "./button";
import { cx } from "./cx";
import { EYEBROW } from "./section-label";

/** What Copy details carries: a sentence, the error's name, message and digest, the build, the browser and when. */
export interface ErrorDetailsInput {
  what: string;
  error: unknown;
  build: string;
  userAgent: string;
  at: Date;
}

/** The details as plain lines, nothing personal and no stack: a person pastes them into a message as they are. */
export function errorDetails({ what, error, build, userAgent, at }: ErrorDetailsInput): string {
  const named = error instanceof Error || (typeof error === "object" && error !== null && "message" in error);
  const e = error as { name?: unknown; message?: unknown; digest?: unknown };
  const text = named ? `${typeof e.name === "string" && e.name ? `${e.name}: ` : ""}${String(e.message ?? "")}` : String(error);
  const digest = named && typeof e.digest === "string" && e.digest ? [`Digest: ${e.digest}`] : [];
  return [what, `Error: ${text.slice(0, 500)}`, ...digest, `Version: ${build}`, `Browser: ${userAgent}`, `When: ${at.toISOString()}`].join("\n");
}

export interface ErrorPanelProps {
  /** The tracked word above the title ("Storage", "Today"). */
  eyebrow: string;
  title: string;
  body: string;
  onRetry: () => void;
  /** Built when Copy details is pressed, so its time is the press's. */
  details: () => string;
  /** `screen` stands alone in the window; `inline` takes the place of the part that failed. */
  layout?: "screen" | "inline";
}

export function ErrorPanel({ eyebrow, title, body, onRetry, details, layout = "screen" }: ErrorPanelProps) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const [text, setText] = useState("");
  const copy = async () => {
    const next = details();
    setText(next);
    try {
      await navigator.clipboard.writeText(next);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  };
  const inline = layout === "inline";
  const Heading = inline ? "h2" : "h1";
  return (
    <section
      aria-label={eyebrow}
      className={cx("flex w-full flex-col gap-4", inline ? "rounded-xl border border-line bg-surface px-4 py-5 sm:px-6" : "mx-auto min-h-dvh max-w-md justify-center px-4 py-8 sm:px-5")}
    >
      <p className={EYEBROW}>{eyebrow}</p>
      <Heading className={cx("font-display font-book text-balance text-ink", inline ? "text-pane" : "text-title")}>{title}</Heading>
      <p className="text-body-lg text-pretty text-ink-2">{body}</p>
      {/* Full-width on a phone (SCREENS.md §21 Responsive), side by side from the narrow band. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
        <Button variant="secondary" onClick={() => void copy()}>
          Copy details
        </Button>
      </div>
      <p role="status" className="text-body-sm text-pretty text-ink-2">
        {copied === "yes" ? "Copied." : copied === "no" ? "Couldn’t copy — here they are:" : ""}
      </p>
      {copied === "no" && <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 text-label whitespace-pre-wrap text-ink-2 select-all">{text}</pre>}
    </section>
  );
}
