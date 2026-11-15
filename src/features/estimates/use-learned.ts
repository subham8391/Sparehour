"use client";
// How the person's estimates run, where an estimate is being chosen (learned-store.ts): what the device keeps, and
// a fresh answer asked for in the background when that is old.
import { useEffect, useSyncExternalStore } from "react";
import type { Learned } from "@/core/estimates";
import { useQuery } from "@/data/powersync";
import { learnedFor, refreshLearned, subscribeLearned } from "./learned-store";

const SPACE_SQL = `select personal_space_id from users limit 1`;

export function useLearned(): Learned | null {
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const space = users?.[0]?.personal_space_id ?? null;
  useEffect(() => {
    if (space) void refreshLearned(space);
  }, [space]);
  return useSyncExternalStore(
    subscribeLearned,
    () => learnedFor(space),
    () => null,
  );
}
