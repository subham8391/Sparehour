"use client";
// The typed confirmation every final delete shares (SCREENS.md §18 Data and
// Account: "typed confirmation"; ruling R2: the destructive tone is for Delete
// only). The person types the word, then the one destructive button wakes up.
// A bottom sheet on the phone with 44 px controls, a centred dialog from `sm`.
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { Sheet } from "@/ui/sheet";

/** The word to type. */
export const CONFIRM_WORD = "delete";

/** Whether what was typed confirms: the word, any case, spaces around it ignored. */
export const confirms = (typed: string): boolean => typed.trim().toLowerCase() === CONFIRM_WORD;

export function TypedConfirmSheet({
  title,
  children,
  confirmLabel,
  busyLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  /** What goes, said exactly, and anything to do first. */
  children: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  /** Resolves an error to show, or null once done (the caller closes the sheet). */
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirms(typed) && !busy;
  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const failed = await onConfirm().catch(() => "Something stopped it — nothing was deleted. Try again.");
    if (failed) {
      setError(failed);
      setBusy(false);
    }
  };
  return (
    <Sheet label={title} onClose={onClose} align="center" width="sm">
      <form
        className="flex flex-col gap-4 px-5 pt-2 pb-5 sm:pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="font-display text-pane font-medium text-balance text-ink">{title}</h2>
        <div className="flex flex-col gap-3 text-body text-pretty text-ink-2">{children}</div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="text-body-sm font-medium text-ink">
            Type <span className="font-semibold">{CONFIRM_WORD}</span> to confirm
          </label>
          <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" />
        </div>
        {error && (
          <p role="alert" className="text-body-sm text-pretty text-deadline">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" tone="destructive" disabled={!ready}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
