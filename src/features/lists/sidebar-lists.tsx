"use client";
// The sidebar's Lists section (DECISIONS.md, amendment 2026-10-22): under the areas, every list as a tree — a list's
// lists fold under it — with "+" opening the Lists page's form. An island loaded in idle time (app-shell.tsx), so the
// shells carry none of it; on a phone the same lists are in Browse.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@/data/powersync";
import { LISTS_NAV_SQL, listTree, type ListNavRow, type ListNode } from "@/data/queries/lists";
import { ACTIVE, ITEM } from "@/features/shell/sidebar";
import { isActive } from "@/features/shell/nav";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { EYEBROW } from "@/ui/section-label";

function ListBranch({ node, pathname }: { node: ListNode; pathname: string }) {
  const [open, setOpen] = useState(false);
  const active = isActive(pathname, `/list/${node.id}`);
  const hasChildren = node.children.length > 0;
  return (
    <li>
      <div className={cx(ITEM, active && ACTIVE)} style={node.depth > 0 ? { paddingLeft: `${0.75 + node.depth * 0.75}rem` } : undefined}>
        {/* The icon column holds the emoji (or a dot); a list with lists inside shows the chevron there instead. */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`}
            className="-mr-1 -ml-1.5 flex size-7 touch:size-11 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors dur-fast hover:bg-hover hover:text-ink"
          >
            <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
          </button>
        ) : (
          <span className="flex size-4.5 shrink-0 items-center justify-center text-[0.9375rem] leading-none" aria-hidden="true">
            {node.emoji ?? <span className="size-1.5 rounded-full bg-line-control" />}
          </span>
        )}
        <Link href={`/list/${node.id}`} aria-current={active ? "page" : undefined} className="min-w-0 flex-1 truncate touch:leading-11">
          {hasChildren && node.emoji && <span aria-hidden="true">{node.emoji} </span>}
          {node.name}
        </Link>
      </div>
      {open && hasChildren && (
        <ul className="flex flex-col gap-0.5">
          {node.children.map((c) => (
            <ListBranch key={c.id} node={c} pathname={pathname} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function SidebarLists({ pathname }: { pathname: string }) {
  const { data } = useQuery<ListNavRow>(LISTS_NAV_SQL);
  const tree = useMemo(() => listTree(data ?? []), [data]);
  return (
    <section aria-label="Lists" className="pt-5">
      <div className="flex items-center justify-between pr-1.5 pb-2 pl-3">
        <h2 className={EYEBROW}>
          <Link href="/lists" className="rounded-sm hover:text-ink">
            Lists
          </Link>
        </h2>
        <Link
          href="/lists?add=1"
          aria-label="Add list"
          title="Add list"
          className="-my-1 flex size-7 touch:size-11 items-center justify-center rounded-sm text-ink-3 transition-colors dur-fast hover:bg-hover hover:text-ink"
        >
          <Icon name="plus" size={14} />
        </Link>
      </div>
      {tree.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {tree.map((n) => (
            <ListBranch key={n.id} node={n} pathname={pathname} />
          ))}
        </ul>
      )}
    </section>
  );
}
