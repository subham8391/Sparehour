"use client";
// Share to Sparehour (DECISIONS.md, amendment 2026-10-22): another app's share sheet (the manifest's share_target,
// Android) opens this page with what was shared. It becomes one item, its name editable, saved to the list picked
// here — the last one used is picked already — and the page opens that list. With no list yet, one is made here.
// The words can go to quick-add as a task instead.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { LISTS_NAV_SQL, LISTS_SPACE_SQL, listPaths, type ListNavRow } from "@/data/queries/lists";
import { requestPreview } from "@/features/lists/preview-client";
import { sharedItem } from "@/features/lists/share";
import { useListRepos } from "@/features/lists/use-list-repos";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { Button, buttonClass } from "@/ui/button";
import { Input } from "@/ui/field";
import { Select } from "@/ui/select";

const LAST_LIST_KEY = "sparehour.share-list";
const NEW_LIST = "__new__";
const LABEL = "text-label font-semibold uppercase tracking-eyebrow text-ink-3";

function readLast(): string | null {
  try {
    return localStorage.getItem(LAST_LIST_KEY);
  } catch {
    return null;
  }
}

export default function SharePage() {
  return (
    <Suspense>
      <ShareScreen />
    </Suspense>
  );
}

function ShareScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const quickAdd = useQuickAdd();
  const { lists, items } = useListRepos();
  const shared = useMemo(() => sharedItem({ title: params.get("title"), text: params.get("text"), url: params.get("url") }), [params]);
  const { data: rows } = useQuery<ListNavRow>(LISTS_NAV_SQL);
  const { data: users } = useQuery<{ personal_space_id: string | null }>(LISTS_SPACE_SQL);
  const paths = useMemo(() => listPaths(rows ?? []), [rows]);
  const [title, setTitle] = useState(shared.title);
  const [picked, setPicked] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The list last shared to while it is still there, else the first; "a new list" when there are none.
  const last = useMemo(() => readLast(), []);
  const choice = picked ?? (paths.some((p) => p.id === last) ? last : (paths[0]?.id ?? NEW_LIST));

  const save = async () => {
    const name = title.trim() || shared.url;
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      let listId = choice;
      if (!listId || listId === NEW_LIST) {
        const n = newName.trim();
        if (!n) throw new Error("Give the new list a name.");
        listId = await lists.create(n, { spaceId: users?.[0]?.personal_space_id ?? null });
      }
      const space = await items.spaceOf(listId);
      if (!space) throw new Error("That list isn't on this device any more.");
      const [id] = await items.add(listId, space, [name], { url: shared.url });
      if (id && shared.url) requestPreview(id, shared.url);
      try {
        localStorage.setItem(LAST_LIST_KEY, listId);
      } catch {
        // storage unavailable: the next share starts on the first list
      }
      router.replace(`/list/${listId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save it — try again.");
      setBusy(false);
    }
  };

  if (!shared.title && !shared.url) {
    return (
      <main className={VIEW_COLUMN}>
        <ViewHeader eyebrow="Share" title="Nothing came through" subtitle="The app you shared from sent no words or link." />
        <Link href="/lists" className={buttonClass({ variant: "secondary" })}>
          Go to your lists
        </Link>
      </main>
    );
  }

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Share" title="Save to a list" />
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="share-title" className={LABEL}>
            Name
          </label>
          <Input id="share-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={shared.url ?? "What is it?"} />
          {shared.url && <p className="truncate text-body-sm text-ink-3">{shared.url}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="share-list" className={LABEL}>
            List
          </label>
          <Select id="share-list" value={choice ?? NEW_LIST} onChange={(e) => setPicked(e.target.value)}>
            {paths.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value={NEW_LIST}>A new list…</option>
          </Select>
          {choice === NEW_LIST && <Input aria-label="New list name" placeholder="List name — Anime, Books, Ideas…" value={newName} onChange={(e) => setNewName(e.target.value)} />}
        </div>
        {error && (
          <p role="alert" className="text-body-sm text-deadline">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            Save
          </Button>
          <Button variant="quiet" onClick={() => quickAdd.open([title.trim(), shared.url].filter(Boolean).join(" "))}>
            Make it a task instead
          </Button>
        </div>
      </form>
    </main>
  );
}
