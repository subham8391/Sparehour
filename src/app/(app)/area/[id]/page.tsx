"use client";
// An area (SCREENS.md §9): its name, its projects as cards — open count,
// summed estimate, next deadline — and an "Add project" card last.
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { formatMinutes, localDate } from "@/core/time";
import { formatDay } from "@/core/time/format-day";
import { AREA_SQL, AREA_PROJECT_STATS_SQL, type AreaProjectStatsRow } from "@/data/queries/views";
import { AreaRepo } from "@/data/repositories/area-repo";
import { ProjectRepo } from "@/data/repositories/project-repo";
import type { AreaRow } from "@/data/schema.client";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { EmptyState, VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { Icon } from "@/ui/icons";
import { InlineTitle } from "@/ui/inline-title";

export default function AreaPage({ params }: PageProps<"/area/[id]">) {
  const { id } = use(params);
  const db = useLocalDatabase();
  const areaRepo = useMemo(() => new AreaRepo(db), [db]);
  const projectRepo = useMemo(() => new ProjectRepo(db), [db]);
  const now = useNow();
  const { today, settings } = useLocalDay(now);
  const { data: areas, isLoading } = useQuery<AreaRow>(AREA_SQL, [id]);
  const { data: projects } = useQuery<AreaProjectStatsRow>(AREA_PROJECT_STATS_SQL, [settings?.defaultEstimateMin ?? 30, id]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const area = areas?.[0];

  if (!isLoading && !area) {
    return (
      <main className={VIEW_COLUMN}>
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
  if (!area) return <main className="p-6 text-ink-3 md:p-10">Opening…</main>;

  const createProject = () => {
    const n = name.trim();
    setAdding(false);
    setName("");
    if (!n || !area.space_id) return;
    void projectRepo.create(n, { spaceId: area.space_id, areaId: area.id });
  };

  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader
        eyebrow="Area"
        title={<InlineTitle value={area.name ?? "Untitled area"} label="Area name" onSave={(n) => void areaRepo.rename(area.id, n)} className="font-display text-3xl leading-tight text-ink" />}
        subtitle={projects ? `${projects.length} ${projects.length === 1 ? "project" : "projects"}` : undefined}
      />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(projects ?? []).map((p) => (
          <li key={p.id}>
            <Link href={`/project/${p.id}`} className="flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-line bg-surface p-4 hover:border-line-strong">
              <span className="text-[15px] font-medium text-ink">{p.name ?? "Untitled project"}</span>
              <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-ink-2">
                <span>
                  {p.open_count} open{p.open_count > 0 && ` · ~${formatMinutes(p.open_min)}`}
                </span>
                {(p.next_deadline ?? p.deadline) && (
                  <span className="flex items-center gap-1 rounded-md bg-deadline-soft px-1.5 py-0.5 text-deadline">
                    <Icon name="flag" size={11} /> {formatDay(localDate((p.next_deadline ?? p.deadline) as string), { today })}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
        <li>
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProject();
              }}
              className="flex min-h-24 flex-col justify-between gap-2 rounded-xl border border-ink bg-surface p-4"
            >
              <input
                autoFocus
                aria-label="Project name"
                placeholder="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={createProject}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setName("");
                    setAdding(false);
                  }
                }}
                className="bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-ink-3"
              />
              <span className="text-xs text-ink-3">Enter to create · Esc to cancel</span>
            </form>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="flex min-h-24 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-[15px] text-ink-2 hover:border-ink hover:text-ink">
              <Icon name="plus" size={16} /> Add project
            </button>
          )}
        </li>
      </ul>
    </main>
  );
}
