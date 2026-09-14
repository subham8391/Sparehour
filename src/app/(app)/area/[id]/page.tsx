"use client";
// An area (SCREENS.md §9): its projects. Tasks live in projects.
import Link from "next/link";
import { use } from "react";
import { useQuery } from "@/data/powersync";
import { AREA_PROJECTS_SQL, AREA_SQL } from "@/data/queries/views";
import type { AreaRow } from "@/data/schema.client";
import { EmptyState, ViewHeader } from "@/features/shell/view-header";
import { Icon } from "@/ui/icons";

export default function AreaPage({ params }: PageProps<"/area/[id]">) {
  const { id } = use(params);
  const { data: areas, isLoading } = useQuery<AreaRow>(AREA_SQL, [id]);
  const { data: projects } = useQuery<{ id: string; name: string | null }>(AREA_PROJECTS_SQL, [id]);
  const area = areas?.[0];

  if (!isLoading && !area) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
        <ViewHeader eyebrow="Area" title="Not here" />
        <EmptyState>
          This area isn&rsquo;t on this device.{" "}
          <Link href="/browse" className="font-medium text-ink underline">
            Browse
          </Link>
        </EmptyState>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <ViewHeader eyebrow="Area" title={area?.name ?? "…"} />
      {projects && projects.length === 0 ? (
        <EmptyState>No projects in this area yet.</EmptyState>
      ) : (
        <ul className="rounded-xl border border-line bg-surface">
          {(projects ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/project/${p.id}`} className="flex min-h-11 items-center gap-3 border-t border-line px-4 text-[15px] first:border-t-0">
                <span className="size-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
                <span className="flex-1">{p.name ?? "Untitled project"}</span>
                <Icon name="chevron-right" size={16} className="text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
