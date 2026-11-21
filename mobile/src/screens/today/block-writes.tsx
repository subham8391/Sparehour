// What the phone does after a block changes (SYSTEM_DESIGN.md §6.5): asks the server to write it to Google soon
// after, as the web does, with the web's own debounce and address (../../../../src/features/blocking/
// push-after-write.ts) but called with the session's token instead of a cookie (~/api). Everything under
// <BlockWrites> that places or edits a block through the shared hooks (usePlacing, useBlockRepo) says so here; it
// also gives them the place "Block it" is answered from (BlockingProvider), which usePlacing needs above it.
import type { ReactNode } from "react";
import { AfterBlockWriteContext, type AfterBlockWrite } from "@/features/blocking/block-repo-after";
import { BlockingProvider } from "@/features/blocking/blocking-provider";
import { schedulePush } from "@/features/blocking/push-after-write";
import { apiFetch } from "~/api";

const askServer: typeof fetch = (input, init) => apiFetch(String(input), init ?? {});

/** Kept as one object, so the repository it is handed to is made once. */
const AFTER: AfterBlockWrite = { changed: () => schedulePush(askServer) };

export function BlockWrites({ children }: { children: ReactNode }) {
  return (
    <AfterBlockWriteContext.Provider value={AFTER}>
      <BlockingProvider>{children}</BlockingProvider>
    </AfterBlockWriteContext.Provider>
  );
}
