"use client";
// A list's three sheets (DECISIONS.md, amendment 2026-10-22), loaded when one is first opened: "Pick one for me",
// "Move to…" (anywhere but inside itself) and "Delete list…", which says what goes with it before it goes.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { LISTS_NAV_SQL, listPaths, type ListNavRow } from "@/data/queries/lists";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { MENU_ITEM } from "@/ui/popover";
import { Sheet } from "@/ui/sheet";
import { ListGlyph } from "./list-parts";
import { useListRepos } from "./use-list-repos";

const BODY = "flex flex-col gap-4 px-5 pt-3 pb-5 sm:px-6 sm:pt-5";
const HEADING = "font-display text-pane font-book text-balance text-ink";

/** Picks an open item from the list and the lists inside it, at random; "Pick again" for another. */
export function PickSheet({ listId, listName, onOpenItem, onClose }: { listId: string; listName: string; onOpenItem: (id: string) => void; onClose: () => void }) {
  const { lists, items } = useListRepos();
  const { data: rows } = useQuery<ListNavRow>(LISTS_NAV_SQL);
  const paths = useMemo(() => new Map(listPaths(rows ?? []).map((p) => [p.id, p.label])), [rows]);
  const [pick, setPick] = useState<{ id: string; title: string; list_id: string } | null | undefined>(undefined);
  const again = () => void lists.pick(listId).then(setPick);
  useEffect(again, [listId]); // eslint-disable-line react-hooks/exhaustive-deps -- one pick as the sheet opens
  return (
    <Sheet label={`Pick one from ${listName}`} onClose={onClose} width="sm" align="center">
      <div className={BODY}>
        <p className="flex items-center gap-2 text-label font-semibold uppercase tracking-eyebrow text-ink-3">
          <ListGlyph name="shuffle" size={14} /> Picked for you
        </p>
        {pick === undefined ? (
          <p className="h-16" />
        ) : pick === null ? (
          <p className="text-body-lg text-ink-2">Nothing left to pick: every item here is done.</p>
        ) : (
          <div className="flex flex-col gap-1" aria-live="polite">
            <p className={HEADING}>{pick.title || "Untitled"}</p>
            {pick.list_id !== listId && <p className="text-body-sm text-ink-2">From {paths.get(pick.list_id) ?? "a list inside"}</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {pick && (
            <Button variant="primary" onClick={() => void items.setStatus(pick.id, "doing").then(onClose)}>
              Start it
            </Button>
          )}
          {pick && (
            <Button variant="secondary" onClick={() => onOpenItem(pick.id)}>
              Open
            </Button>
          )}
          <Button variant="quiet" onClick={again}>
            Pick again
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Where the list can go: the top level or any list that is neither it nor inside it. */
export function MoveListSheet({ listId, listName, parentId, onClose }: { listId: string; listName: string; parentId: string | null; onClose: () => void }) {
  const { lists } = useListRepos();
  const { data: rows } = useQuery<ListNavRow>(LISTS_NAV_SQL);
  const targets = useMemo(() => {
    const all = listPaths(rows ?? []);
    const self = all.find((p) => p.id === listId);
    // Its own subtree follows it in tree order with a longer path: everything labelled under it is out.
    return all.filter((p) => p.id !== listId && !(self && p.label.startsWith(`${self.label} › `)));
  }, [rows, listId]);
  const go = (to: string | null) => void lists.setParent(listId, to).then(onClose);
  return (
    <Sheet label={`Move ${listName}`} onClose={onClose} width="sm" align="top" className="overflow-y-auto">
      <div className={BODY}>
        <h2 className={HEADING}>Move “{listName}”</h2>
        <ul className="-mx-2 flex flex-col">
          <li>
            <button type="button" className={cx(MENU_ITEM, "w-full")} disabled={parentId === null} onClick={() => go(null)}>
              Top level{parentId === null && " (here now)"}
            </button>
          </li>
          {targets.map((t) => (
            <li key={t.id}>
              <button type="button" className={cx(MENU_ITEM, "w-full")} style={{ paddingLeft: `${0.75 + t.depth * 1}rem` }} disabled={t.id === parentId} onClick={() => go(t.id)}>
                <span className="truncate">{t.label.split(" › ").at(-1)}</span>
                {t.id === parentId && <span className="ml-1 text-ink-3">(here now)</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

/** "Delete list…": what goes with it, counted, and Undo in the toast afterwards. */
export function DeleteListSheet({ listId, listName, onClose, onDeleted }: { listId: string; listName: string; onClose: () => void; onDeleted: () => void }) {
  const { lists } = useListRepos();
  const [count, setCount] = useState<{ lists: number; items: number } | null>(null);
  useEffect(() => void lists.contents(listId).then(setCount), [lists, listId]);
  const parts = count ? [count.lists && `${count.lists} ${count.lists === 1 ? "list" : "lists"}`, count.items && `${count.items} ${count.items === 1 ? "item" : "items"}`].filter(Boolean) : [];
  return (
    <Sheet label={`Delete ${listName}`} onClose={onClose} width="sm" align="center">
      <div className={BODY}>
        <h2 className={HEADING}>Delete “{listName}”?</h2>
        <p className="text-body text-pretty text-ink-2">
          {parts.length > 0 ? `${parts.join(" and ")} inside it go too.` : "It's empty."} You can undo it straight after.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" tone="destructive" onClick={() => void lists.remove(listId).then(onDeleted)}>
            Delete list
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
