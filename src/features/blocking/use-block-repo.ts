"use client";
import { useContext } from "react";
import type { BlockRepo } from "@/data/repositories/block-repo";
import { noteBlockCreated } from "@/features/notifications/block-nudge-store";
import { AfterBlockWriteContext, useBlockRepoWith, type AfterBlockWrite } from "./block-repo-after";
import { schedulePush } from "./push-after-write";

/**
 * The web's word after a block write: a nudge to write the change to Google soon after (§6.5), and — the first time a
 * block is made on a device not yet asked — the moment to offer a reminder (PRODUCT_SPEC.md §14 rule 7).
 */
const WEB_AFTER: AfterBlockWrite = { changed: () => schedulePush(), created: () => noteBlockCreated() };

/**
 * The block repository, plus what the app does after a write (block-repo-after.ts): the web's own, unless whoever
 * runs the app provided theirs (the Android app does, `AfterBlockWriteContext`).
 */
export function useBlockRepo(): BlockRepo {
  return useBlockRepoWith(useContext(AfterBlockWriteContext) ?? WEB_AFTER);
}
