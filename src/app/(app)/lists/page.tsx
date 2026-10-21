"use client";
// Lists (DECISIONS.md, amendment 2026-10-22): the top-level lists as cards — what each holds — and a form for a new
// one. Lists hold things that aren't tasks (an anime to watch, an idea from an article); a list can hold lists. The
// sidebar's "+" and Browse's "Add list" open the form (`?add=1`).
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@/data/powersync";
import { LISTS_SPACE_SQL, TOP_LISTS_SQL, type ListCardRow } from "@/data/queries/lists";
import { ListCards } from "@/features/lists/list-parts";
import { useListRepos } from "@/features/lists/use-list-repos";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icons";
import { EmptyCard } from "@/ui/list-card";
import { SectionAction, SectionLabel } from "@/ui/section-label";

/** Opens the form when the URL asks, then takes the parameter off so the next ask opens it again. */
function AddFromQuery({ onAdd }: { onAdd: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const add = params.get("add");
  useEffect(() => {
    if (!add) return;
    onAdd();
    router.replace("/lists", { scroll: false });
  }, [add, onAdd, router]);
  return null;
}

export default function ListsPage() {
  const router = useRouter();
  const { lists } = useListRepos();
  const { data: users } = useQuery<{ personal_space_id: string | null }>(LISTS_SPACE_SQL);
  const { data: rows, isLoading } = useQuery<ListCardRow>(TOP_LISTS_SQL);
  const spaceId = users?.[0]?.personal_space_id ?? null;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const create = () => {
    const n = name.trim();
    setAdding(false);
    setName("");
    // A new list opens, so its first item can go straight in.
    if (n) void lists.create(n, { spaceId }).then((id) => router.push(`/list/${id}`));
  };
  const count = rows?.length ?? 0;
  const addLabel = (
    <>
      <Icon name="plus" size={14} /> New list
    </>
  );
  return (
    <main className={VIEW_COLUMN}>
      <Suspense fallback={null}>
        <AddFromQuery onAdd={() => setAdding(true)} />
      </Suspense>
      <ViewHeader title="Lists" subtitle="Things to keep that aren't tasks: what to watch, read, try, or an idea worth holding on to." />
      <section className="flex flex-col gap-2">
        <SectionLabel className="px-0.5" count={count > 0 ? count : undefined} action={!adding && count > 0 && <SectionAction onClick={() => setAdding(true)}>{addLabel}</SectionAction>}>
          Your lists
        </SectionLabel>
        {adding && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <input
              autoFocus
              aria-label="List name"
              placeholder="List name — Anime, Books, Ideas…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={create}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setName("");
                  setAdding(false);
                }
              }}
              className="h-11 w-full rounded-lg border border-ink bg-surface px-3.5 text-base text-ink outline-none placeholder:text-ink-4 sm:text-body-lg"
            />
          </form>
        )}
        {!isLoading && count === 0 && !adding ? (
          <EmptyCard
            fact="No lists yet."
            action={
              <Button variant="link" onClick={() => setAdding(true)}>
                {addLabel}
              </Button>
            }
          >
            Start one for what you want to watch, read or remember.
          </EmptyCard>
        ) : (
          <ListCards lists={rows ?? []} />
        )}
      </section>
    </main>
  );
}
