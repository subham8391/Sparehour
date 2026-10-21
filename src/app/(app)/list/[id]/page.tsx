"use client";
// A list (DECISIONS.md, amendment 2026-10-22): the path above it, its emoji and name, the lists inside it as cards,
// then its items — each with its status ring, stars, link and tags, opening its sheet — in the list's order and
// filtered by status, and an add row that takes one line or a pasted many. The ⋯ makes a list inside, picks an item
// at random, moves the list or deletes it.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, use, useCallback, useEffect, useMemo, useState, type ClipboardEvent } from "react";
import { useQuery } from "@/data/powersync";
import { sorted } from "@/core/ordering";
import { itemLines } from "@/data/repositories/list-item-repo";
import {
  arrangeItems,
  CHILD_LISTS_SQL,
  LIST_ITEMS_SQL,
  LIST_PATH_SQL,
  LIST_SQL,
  listCardLine,
  toListItem,
  type ItemOrder,
  type ListCardRow,
  type ListItem,
  type ListItemRow,
  type StatusFilter,
} from "@/data/queries/lists";
import type { ListRow } from "@/data/schema.client";
import { ListCards, EmojiPicker, ListGlyph, Stars, StatusRing } from "@/features/lists/list-parts";
import { useListRepos } from "@/features/lists/use-list-repos";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { Loading } from "../../loading-view";
import { buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { InlineTitle } from "@/ui/inline-title";
import { EmptyCard, ListCard } from "@/ui/list-card";
import { MENU_ITEM, MENU_ITEM_DESTRUCTIVE, MENU_SEPARATOR, MenuButton } from "@/ui/popover";
import { SectionAction, SectionLabel } from "@/ui/section-label";
import { Segmented } from "@/ui/segmented";
import { Select } from "@/ui/select";
import { Switch } from "@/ui/switch";

const ItemSheet = dynamic(() => import("@/features/lists/item-sheet").then((m) => m.ItemSheet), { ssr: false });
const PickSheet = dynamic(() => import("@/features/lists/list-sheets").then((m) => m.PickSheet), { ssr: false });
const MoveListSheet = dynamic(() => import("@/features/lists/list-sheets").then((m) => m.MoveListSheet), { ssr: false });
const DeleteListSheet = dynamic(() => import("@/features/lists/list-sheets").then((m) => m.DeleteListSheet), { ssr: false });

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "todo", label: "To do" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
];
const ORDERS: { value: ItemOrder; label: string }[] = [
  { value: "manual", label: "By hand" },
  { value: "name", label: "Name" },
  { value: "added", label: "Newest" },
  { value: "rating", label: "Rating" },
];
const asOrder = (v: string | null): ItemOrder => (v === "name" || v === "added" || v === "rating" ? v : "manual");

/** The link's site, for the row ("myanimelist.net"). */
function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type Sheet = { kind: "item"; id: string } | { kind: "pick" } | { kind: "move" } | { kind: "delete" } | null;

/** `?item=…` (a search or palette hit) opens that item's sheet once, then comes off the URL. */
function OpenFromQuery({ listId, onOpen }: { listId: string; onOpen: (itemId: string) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const item = params.get("item");
  useEffect(() => {
    if (!item) return;
    onOpen(item);
    router.replace(`/list/${listId}`, { scroll: false });
  }, [item, listId, onOpen, router]);
  return null;
}

export default function ListPage({ params }: PageProps<"/list/[id]">) {
  const { id } = use(params);
  const router = useRouter();
  const { lists, items } = useListRepos();
  const { data: listRows, isLoading } = useQuery<ListRow>(LIST_SQL, [id]);
  const { data: pathRows } = useQuery<{ id: string; name: string | null; emoji: string | null }>(LIST_PATH_SQL, [id]);
  const { data: childRows } = useQuery<ListCardRow>(CHILD_LISTS_SQL, [id]);
  const { data: itemRows } = useQuery<ListItemRow>(LIST_ITEMS_SQL, [id]);
  const all = useMemo(() => (itemRows ?? []).map(toListItem), [itemRows]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [draft, setDraft] = useState("");
  const [addingList, setAddingList] = useState(false);
  const [listName, setListName] = useState("");
  const list = listRows?.[0];
  const openItem = useCallback((itemId: string) => setSheet({ kind: "item", id: itemId }), []);

  if (!isLoading && !list) {
    return (
      <main className={VIEW_COLUMN}>
        <ViewHeader eyebrow="List" title="Not here" />
        <EmptyCard
          action={
            <Link href="/lists" className={buttonClass({ variant: "link" })}>
              Lists
              <Icon name="chevron-right" size={16} className="text-ink-3" />
            </Link>
          }
        >
          This list isn&rsquo;t on this device.
        </EmptyCard>
      </main>
    );
  }
  if (!list) return <Loading />;

  const name = list.name ?? "Untitled list";
  const order = asOrder(list.item_order);
  const hideDone = Boolean(list.hide_done);
  const shown = arrangeItems(all, order, filter, hideDone);
  const handOrder = sorted(all);
  const doneCount = all.filter((i) => i.status === "done").length;
  const above = (pathRows ?? []).slice(0, -1);
  const spaceId = list.space_id ?? "";

  const add = (titles: string[]) => {
    if (titles.length && spaceId) void items.add(list.id, spaceId, titles);
  };
  const submit = () => {
    const titles = itemLines(draft);
    setDraft("");
    add(titles);
  };
  // A paste of several lines is several items, one each (bullets, numbers and boxes taken off).
  const paste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/\r?\n/.test(text.trim())) return;
    e.preventDefault();
    add(itemLines(`${draft}${text}`));
    setDraft("");
  };
  // Move up / Move down over what is shown: the item goes before (or after) its visible neighbour in the hand order.
  const move = (item: ListItem, dir: -1 | 1) => {
    const at = shown.findIndex((x) => x.id === item.id);
    const neighbour = shown[at + dir];
    if (!neighbour) return;
    const others = handOrder.filter((x) => x.id !== item.id);
    const index = others.findIndex((x) => x.id === neighbour.id) + (dir === 1 ? 1 : 0);
    void items.reorder(item.id, index);
  };
  const createList = () => {
    const n = listName.trim();
    setAddingList(false);
    setListName("");
    if (n && spaceId) void lists.create(n, { spaceId, parentId: list.id }).then((nid) => router.push(`/list/${nid}`));
  };

  const breadcrumb = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
      <Link href="/lists" className="rounded-sm hover:text-ink">
        Lists
      </Link>
      {above.map((p) => (
        <Fragment key={p.id}>
          <span aria-hidden="true">›</span>
          <Link href={`/list/${p.id}`} className="max-w-40 truncate rounded-sm hover:text-ink">
            {p.name ?? "Untitled list"}
          </Link>
        </Fragment>
      ))}
    </span>
  );

  return (
    <main className={VIEW_COLUMN}>
      <Suspense fallback={null}>
        <OpenFromQuery listId={list.id} onOpen={openItem} />
      </Suspense>
      <ViewHeader
        eyebrow={<nav aria-label="Where this list is">{breadcrumb}</nav>}
        title={
          <div className="-ml-2 flex items-center gap-1">
            <EmojiPicker emoji={list.emoji} name={name} onChange={(e) => void lists.setEmoji(list.id, e)} />
            <InlineTitle value={name} label="List name" onSave={(n) => void lists.rename(list.id, n)} className="min-w-0 font-display text-title font-book text-balance text-ink" />
          </div>
        }
        subtitle={<span className="num">{listCardLine({ items: all.length, open: all.length - doneCount, lists: childRows?.length ?? 0 })}</span>}
        compactActions={
          <MenuButton label="List actions">
            {(close) => (
              <>
                <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (setAddingList(true), close())}>
                  New list inside
                </button>
                <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (setSheet({ kind: "pick" }), close())}>
                  Pick one for me
                </button>
                <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (setSheet({ kind: "move" }), close())}>
                  Move to…
                </button>
                <div className={MENU_SEPARATOR} role="separator" />
                <button type="button" role="menuitem" className={MENU_ITEM_DESTRUCTIVE} onClick={() => (setSheet({ kind: "delete" }), close())}>
                  Delete list…
                </button>
              </>
            )}
          </MenuButton>
        }
      />

      {((childRows?.length ?? 0) > 0 || addingList) && (
        <section aria-label={`Lists in ${name}`} className="flex flex-col gap-2">
          <SectionLabel className="px-0.5" action={!addingList && <SectionAction onClick={() => setAddingList(true)}><Icon name="plus" size={14} /> Add list</SectionAction>}>
            Lists
          </SectionLabel>
          {addingList && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createList();
              }}
            >
              <input
                autoFocus
                aria-label="New list name"
                placeholder={`A list inside ${name}`}
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                onBlur={createList}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setListName("");
                    setAddingList(false);
                  }
                }}
                className="h-11 w-full rounded-lg border border-ink bg-surface px-3.5 text-base text-ink outline-none placeholder:text-ink-4 sm:text-body-lg"
              />
            </form>
          )}
          <ListCards lists={childRows ?? []} />
        </section>
      )}

      <section aria-label={`Items in ${name}`} className="flex flex-col gap-3">
        <SectionLabel className="px-0.5" count={all.length > 0 ? all.length : undefined} detail={doneCount > 0 ? `${doneCount} done` : undefined}>
          Items
        </SectionLabel>
        {all.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Segmented label="Show" value={filter} options={FILTERS} onChange={setFilter} />
            <label className="flex items-center gap-2 text-body-sm text-ink-2">
              <span className="sr-only sm:not-sr-only">Sort</span>
              <Select aria-label="Sort items" value={order} onChange={(e) => void lists.setOrder(list.id, asOrder(e.target.value))} className="w-auto">
                {ORDERS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>
            {filter === "all" && doneCount > 0 && (
              <label className="flex items-center gap-2 text-body-sm text-ink-2">
                <Switch checked={hideDone} onChange={(v) => void lists.setHideDone(list.id, v)} aria-label="Hide done items" />
                <span aria-hidden="true">Hide done</span>
              </label>
            )}
          </div>
        )}
        <ListCard aria-label={name} className="overflow-clip">
          {shown.map((item, i) => (
            <li key={item.id} data-list-item={item.id} className="flex items-center border-t border-line first:border-t-0">
              <StatusRing status={item.status} title={item.title} onChange={(s) => void items.setStatus(item.id, s)} />
              <button type="button" onClick={() => setSheet({ kind: "item", id: item.id })} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 pr-2 text-left focus-visible:-outline-offset-2">
                <span className={cx("text-body-lg text-pretty", item.status === "done" ? "text-ink-3 line-through decoration-ink-4" : "text-ink")}>{item.title || "Untitled"}</span>
                {(item.rating || item.url || item.tags.length > 0 || item.note || item.status === "doing") && (
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-body-sm text-ink-3">
                    {item.status === "doing" && <span className="font-medium text-ink-2">Doing</span>}
                    <Stars rating={item.rating} />
                    {item.url && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <ListGlyph name="link" size={13} />
                        <span className="max-w-48 truncate">{host(item.url)}</span>
                      </span>
                    )}
                    {item.tags.map((t) => (
                      <span key={t}>@{t}</span>
                    ))}
                    {item.note && (
                      <span className="inline-flex">
                        <ListGlyph name="note" size={13} />
                        <span className="sr-only">Has a note</span>
                      </span>
                    )}
                  </span>
                )}
              </button>
              <MenuButton label={`Actions for ${item.title || "item"}`} className="mr-1 size-11 shrink-0 sm:size-9 touch:size-11">
                {(close) => (
                  <>
                    {order === "manual" && i > 0 && (
                      <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (move(item, -1), close())}>
                        Move up
                      </button>
                    )}
                    {order === "manual" && i < shown.length - 1 && (
                      <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (move(item, 1), close())}>
                        Move down
                      </button>
                    )}
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (setSheet({ kind: "item", id: item.id }), close())}>
                      Open
                    </button>
                    <button type="button" role="menuitem" className={MENU_ITEM} onClick={() => (void items.toTask(item.id), close())}>
                      Turn into a task
                    </button>
                    <div className={MENU_SEPARATOR} role="separator" />
                    <button type="button" role="menuitem" className={MENU_ITEM_DESTRUCTIVE} onClick={() => (void items.remove(item.id), close())}>
                      Delete
                    </button>
                  </>
                )}
              </MenuButton>
            </li>
          ))}
          {all.length > 0 && shown.length === 0 && (
            <li className="px-4 py-3 text-body text-ink-3">{filter === "all" ? `All ${doneCount} done and hidden.` : `Nothing ${filter === "todo" ? "to do" : filter === "doing" ? "in progress" : "done"} here.`}</li>
          )}
          <li className={cx("flex items-center", (shown.length > 0 || all.length > 0) && "border-t border-line")}>
            <span className="flex size-11 shrink-0 items-center justify-center text-ink-3" aria-hidden="true">
              <Icon name="plus" size={16} />
            </span>
            <form
              className="min-w-0 flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                aria-label={`Add to ${name}`}
                placeholder={all.length === 0 ? `Add to ${name} — paste a list to add many` : `Add to ${name}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={paste}
                enterKeyHint="done"
                className="h-12 w-full bg-transparent pr-4 text-base text-ink outline-none placeholder:text-ink-4 sm:text-body-lg"
              />
            </form>
          </li>
        </ListCard>
        {all.length > 1 && (
          <button type="button" onClick={() => setSheet({ kind: "pick" })} className={cx(buttonClass({ variant: "quiet" }), "self-start")}>
            <ListGlyph name="shuffle" size={16} /> Pick one for me
          </button>
        )}
      </section>

      {sheet?.kind === "item" && <ItemSheet itemId={sheet.id} onClose={() => setSheet(null)} />}
      {sheet?.kind === "pick" && <PickSheet listId={list.id} listName={name} onOpenItem={(itemId) => setSheet({ kind: "item", id: itemId })} onClose={() => setSheet(null)} />}
      {sheet?.kind === "move" && <MoveListSheet listId={list.id} listName={name} parentId={list.parent_id} onClose={() => setSheet(null)} />}
      {sheet?.kind === "delete" && (
        <DeleteListSheet listId={list.id} listName={name} onClose={() => setSheet(null)} onDeleted={() => router.push(list.parent_id ? `/list/${list.parent_id}` : "/lists")} />
      )}
    </main>
  );
}
