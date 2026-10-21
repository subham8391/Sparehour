"use client";
// An item, opened from its list (DECISIONS.md, amendment 2026-10-22): its name, status, rating, link (with the
// server's preview once there is one), note and tags, where it lives, "Turn into a task" and delete. A bottom sheet on
// a phone, a dialog above; loaded when an item is first opened.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { normaliseUrl } from "@/data/repositories/list-item-repo";
import {
  LIST_ITEM_SQL,
  LIST_ITEM_TAGS_SQL,
  LIST_TAG_NAMES_SQL,
  LISTS_NAV_SQL,
  listPaths,
  STATUS_LABEL,
  type ItemStatus,
  type ListNavRow,
} from "@/data/queries/lists";
import { Button, buttonClass } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Input } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { InlineTitle } from "@/ui/inline-title";
import { NoteField } from "@/ui/note-field";
import { Segmented } from "@/ui/segmented";
import { Select } from "@/ui/select";
import { Sheet } from "@/ui/sheet";
import { ListGlyph, StarPicker } from "./list-parts";
import { useListRepos } from "./use-list-repos";

interface ItemSheetRow {
  id: string;
  space_id: string;
  list_id: string;
  list_name: string | null;
  title: string | null;
  note_md: string | null;
  url: string | null;
  status: string | null;
  rating: number | null;
  preview_title: string | null;
  preview_image: string | null;
}

const STATUSES: { value: ItemStatus; label: string }[] = (["todo", "doing", "done"] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] }));
const LABEL = "text-label font-semibold uppercase tracking-eyebrow text-ink-3";

export function ItemSheet({ itemId, onClose, onTaskMade }: { itemId: string; onClose: () => void; onTaskMade?: (taskId: string) => void }) {
  const { items } = useListRepos();
  const { data: rows, isLoading } = useQuery<ItemSheetRow>(LIST_ITEM_SQL, [itemId]);
  const { data: tagRows } = useQuery<{ id: string; name: string }>(LIST_ITEM_TAGS_SQL, [itemId]);
  const { data: allTags } = useQuery<{ id: string; name: string }>(LIST_TAG_NAMES_SQL);
  const { data: listRows } = useQuery<ListNavRow>(LISTS_NAV_SQL);
  const item = rows?.[0];
  const paths = useMemo(() => listPaths(listRows ?? []), [listRows]);
  const [link, setLink] = useState("");
  const [tag, setTag] = useState("");
  const [made, setMade] = useState(false);
  // The field follows the stored link when it changes (a save here, or another device's).
  const [shownUrl, setShownUrl] = useState<string | null | undefined>(undefined);
  if (item && item.url !== shownUrl) {
    setShownUrl(item.url);
    setLink(item.url ?? "");
  }

  // The item went (deleted here or elsewhere): the sheet goes with it.
  useEffect(() => {
    if (!isLoading && rows && rows.length === 0) onClose();
  }, [isLoading, rows, onClose]);
  if (!item) return null;

  const title = item.title ?? "";
  const status: ItemStatus = item.status === "doing" || item.status === "done" ? item.status : "todo";
  const saveLink = () => {
    const next = normaliseUrl(link);
    if ((next ?? "") !== (item.url ?? "")) void items.setUrl(item.id, link);
    setLink(next ?? (link.trim() ? link : ""));
  };
  const addTag = () => {
    const name = tag.trim();
    setTag("");
    if (name) void items.attachTag(item.id, item.space_id, name);
  };

  return (
    <Sheet label={title ? `Item: ${title}` : "Item"} onClose={onClose} width="lg" align="top" className="overflow-y-auto">
      <div className="flex flex-col gap-5 px-5 pt-3 pb-5 sm:px-6 sm:pt-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={cx(LABEL, "mb-1")}>{item.list_name ?? "List"}</p>
            <InlineTitle value={title || "Untitled"} label="Item name" as="h2" onSave={(n) => void items.rename(item.id, n)} className="font-display text-pane font-book text-balance text-ink" />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={buttonClass({ variant: "icon", size: "auto" })}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <span className={LABEL}>Status</span>
          <Segmented label="Status" value={status} options={STATUSES} onChange={(s) => void items.setStatus(item.id, s)} className="self-start" />
        </div>

        <div className="flex flex-col gap-1">
          <span className={LABEL}>Rating</span>
          <StarPicker rating={item.rating} onChange={(r) => void items.setRating(item.id, r)} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="item-link" className={LABEL}>
            Link
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="item-link"
              inputMode="url"
              placeholder="Paste a link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onBlur={saveLink}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveLink();
                }
              }}
            />
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: "secondary" })} aria-label="Open the link in a new tab">
                <ListGlyph name="link" size={16} /> Open
              </a>
            )}
          </div>
          {(item.preview_title || item.preview_image) && item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-line p-2 hover:border-line-strong">
              {item.preview_image && (
                // The preview is the page's own picture, fetched by the server (FEATURES.md §12); never a tracking pixel of ours.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.preview_image} alt="" className="size-14 shrink-0 rounded-sm object-cover" referrerPolicy="no-referrer" loading="lazy" />
              )}
              <span className="line-clamp-2 text-body-sm text-ink-2">{item.preview_title}</span>
            </a>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className={LABEL} aria-hidden="true">
            Note
          </span>
          <NoteField value={item.note_md} onSave={(n) => void items.setNote(item.id, n)} label="Note" placeholder="Why it's interesting, what you thought…" />
        </div>

        <div className="flex flex-col gap-2">
          <span className={LABEL}>Tags</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {(tagRows ?? []).map((t) => (
              <span key={t.id} className="inline-flex h-8 items-center gap-1 rounded-sm bg-surface-2 pr-1 pl-2.5 text-body-sm text-ink-2">
                @{t.name}
                <button type="button" aria-label={`Remove @${t.name}`} onClick={() => void items.detachTag(item.id, t.id)} className="flex size-7 items-center justify-center rounded-sm hover:bg-hover hover:text-ink">
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addTag();
              }}
              className="min-w-40 flex-1"
            >
              <Input aria-label="Add a tag" placeholder="Add a tag" list="item-tag-names" value={tag} onChange={(e) => setTag(e.target.value)} onBlur={addTag} size="auto" className="[&::-webkit-calendar-picker-indicator]:hidden" />
              <datalist id="item-tag-names">
                {(allTags ?? []).map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            </form>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="item-list" className={LABEL}>
            In list
          </label>
          <Select id="item-list" value={item.list_id} onChange={(e) => void items.moveTo(item.id, e.target.value)}>
            {paths.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {/* Once made it says so and does nothing more, but keeps focus (a disabled button would drop it out of the sheet). */}
          <Button
            variant="secondary"
            aria-disabled={made || undefined}
            className={made ? "opacity-60" : undefined}
            onClick={() => {
              if (made) return;
              setMade(true);
              void items.toTask(item.id).then((taskId) => {
                if (taskId) onTaskMade?.(taskId);
              });
            }}
          >
            {made ? "Added to the Inbox" : "Turn into a task"}
          </Button>
          <Button variant="quiet" tone="destructive" onClick={() => (void items.remove(item.id), onClose())}>
            Delete item
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
