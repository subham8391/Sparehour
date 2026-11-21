// The look as this phone draws it (DECISIONS.md, amendment 2026-10-20). The look is the account's
// (user_settings.look: "it follows you to every device", and Settings writes it there); this is the phone's own copy,
// the twin of the web's in the browser's storage (../../../../src/features/looks/look.ts, under the same key), so a
// cold start is already in the right look before the account's row has been read (ui/kept.ts). account-look.tsx
// brings the copy up to date when the row says otherwise. `useColours()` in ui/theme.ts reads it, so every screen
// follows at once.
import { DEFAULT_LOOK, LOOK_KEY, isLookId } from "@/features/looks/look";
import { kept, useKept } from "../kept";
import { LOOK_TOKENS } from "./generated";
import type { LookTokens } from "./types";

const choice = kept<string>(LOOK_KEY, DEFAULT_LOOK, (v) => (isLookId(v) ? v : null));

/** The look's id, as the account keeps it. */
export const lookChoice = choice.get;
/** Shows the look now and keeps it for the next launch. Anything that is not a look's id is Sky, as on the web. */
export const setLookChoice = (id: string): void => choice.set(isLookId(id) ? id : DEFAULT_LOOK);
export const subscribeLookChoice = choice.subscribe;
/** Resolves once this phone's copy has been read. */
export const lookChoiceReady = choice.ready;
/** For tests: forget what this run read and chose. */
export const resetLookChoice = choice.reset;

export function useLookChoice(): string {
  return useKept(choice);
}

/** A look's values. One this build does not know (added on the web since) is drawn as Sky until the app is updated. */
export const tokensOf = (id: string): LookTokens => LOOK_TOKENS[id] ?? LOOK_TOKENS[DEFAULT_LOOK];
