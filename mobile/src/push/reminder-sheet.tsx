// The sheet a plain tap on a reminder opens (SYSTEM_DESIGN.md §7.3; the web's `PushActionSheet` in
// features/notifications/push-actions.tsx): the kind's title and the same choices its notification's buttons offer,
// the first one primary. The titles and the choices are the web's own (push-action-rules.ts, actions.ts). A tap on
// the scrim or Android's back closes it, as Escape and the backdrop do on the web. Presentational.
import { actionsFor, type PushAction } from "@/features/notifications/actions";
import type { DeepLink } from "@/features/notifications/push";
import { SHEET_TITLES } from "@/features/notifications/push-action-rules";
import { Button } from "~/ui/button";
import { Sheet } from "~/ui/sheet";

export function ReminderSheet({ link, onPick, onClose }: { link: DeepLink | null; onPick: (action: PushAction) => void; onClose: () => void }) {
  return (
    <Sheet open={link !== null} title={link ? SHEET_TITLES[link.kind] : undefined} onClose={onClose}>
      {link ? actionsFor(link.kind).map((a, i) => <Button key={a.id} label={a.label} variant={i === 0 ? "primary" : "secondary"} block onPress={() => onPick(a.id)} />) : null}
    </Sheet>
  );
}
