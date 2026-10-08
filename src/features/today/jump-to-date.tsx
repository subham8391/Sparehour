"use client";
// Jump to date (SCREENS.md §12, Day): Today shows any day, picked in words — "next tue", "21 oct", "in 3 days" —
// read exactly as quick-add reads them after a title, or from the date field. The day it resolves to shows as it
// is typed and Enter goes there. A bottom sheet on a phone, a small centred dialog from `sm`. A lazy island: the
// parser it reads words with stays out of Today's first download.
import { useId, useState } from "react";
import { readTypedDate } from "@/core/quickadd/read-date";
import type { Instant, LocalDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { Button } from "@/ui/button";
import { DateField } from "@/ui/date-field";
import { fieldClass } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { relativeDay } from "@/ui/relative-day";
import { Sheet } from "@/ui/sheet";
import { parseDay } from "./day-address";

export interface JumpToDateProps {
  today: LocalDate;
  now: Instant;
  zone: string;
  onJump: (day: LocalDate) => void;
  onClose: () => void;
}

export default function JumpToDate({ today, now, zone, onJump, onClose }: JumpToDateProps) {
  const [text, setText] = useState("");
  // The date field's day waits for Go: a typed date passes through other valid days on its way (1 → 12).
  const [picked, setPicked] = useState("");
  const [missed, setMissed] = useState(false);
  const hintId = useId();
  // Only a date: a time typed with it ("fri 3pm") still lands on Friday.
  const typed = text.trim() ? (readTypedDate(text, { now, zone, today })?.date ?? null) : null;
  const target = text.trim() ? typed : parseDay(picked);
  const go = () => {
    if (target) onJump(target);
    else if (text.trim()) setMissed(true);
  };
  return (
    <Sheet label="Jump to date" onClose={onClose} align="center" width="sm">
      <form
        className="flex flex-col gap-3 px-5 pt-2 pb-5 sm:pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <h2 className="font-display text-pane font-medium text-ink">Jump to date</h2>
        <input
          data-autofocus
          aria-label="Day in words"
          aria-describedby={hintId}
          placeholder="next tue · 21 oct · in 3 days"
          value={text}
          autoComplete="off"
          enterKeyHint="go"
          onChange={(e) => {
            setText(e.target.value);
            setMissed(false);
          }}
          className={fieldClass()}
        />
        <p id={hintId} aria-live="polite" className="-mt-1 flex min-h-5 items-center gap-1 text-body-sm text-ink-2 num">
          {missed ? (
            "Didn't catch that"
          ) : typed ? (
            <>
              <Icon name="arrow-right" size={12} className="shrink-0 text-ink-3" />
              {`${relativeDay(typed, today)}${typed.equals(today) ? "" : ` · ${formatDay(typed, { today })}`}`}
            </>
          ) : null}
        </p>
        <label className="flex items-center justify-between gap-3 text-body-sm text-ink-2">
          Or pick a day
          <DateField value={picked} today={today} placeholder="Pick a date" onChange={(e) => setPicked(e.target.value)} />
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Go
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
