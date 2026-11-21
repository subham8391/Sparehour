// What another app shared, as one quick-add line (the web's /share, `features/share/shared.ts`): the words as the
// task's name, the link as its note. Android hands a share over as one run of text (EXTRA_TEXT): a browser puts the
// page's address there, a notes app the words, a video app "Watch this — https://…". That run is read by the web's own
// rule, as the web reads the `text` its share target is given; nothing of the rule is written again here.
import { sharedLine, sharedWords } from "@/features/share/shared";

/** One thing shared with the app, as expo-sharing hands it over (`getSharedPayloads`). */
export interface Shared {
  /** The words or the address for a share of text; a file's address for anything else. */
  value: string;
  /** "text" or "url" for a share of text; "image", "video", "audio" or "file" otherwise. */
  shareType: string;
}

/** The quick-add line for what was shared; empty when no words and no link came through (a file is neither). */
export function lineFromShare(shared: readonly Shared[]): string {
  const text = shared
    .filter((s) => s.shareType === "text" || s.shareType === "url")
    .map((s) => s.value)
    .join(" ");
  return sharedLine(sharedWords({ text }));
}
