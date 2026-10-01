"use client";
// An area (SCREENS.md §9): its name, its projects as cards with the open
// count, the summed estimate and the next deadline, and an "Add project"
// card last.
import Link from "next/link";
import { use, useState } from "react";
import { useQuery } from "@/data/powersync";
import { formatMinutes, localDate } from "@/core/time";
import { AREA_SQL, AREA_PROJECT_STATS_SQL, type AreaProjectStatsRow } from "@/data/queries/views";
import type { AreaRow } from "@/data/schema.client";
import { useLocalDay, useNow } from "@/features/shell/use-local-day";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { useAreaRepo, useProjectRepo } from "@/features/tasks/use-repos";
import { Loading } from "../../loading-view";
import { buttonClass } from "@/ui/button";
import { DeadlineChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { InlineTitle } from "@/ui/inline-title";
import { CARD, EmptyCard } from "@/ui/list-card";

/** A project card: the list card's shell around a name and a line of figures, and no taller than the two of them. */
const PROJECT_CARD = cx(CARD, "flex h-full flex-col gap-1.5 p-4");

export default function AreaPage({ params }: PageProps<"/area/[id]">) {
  const { id } = use(params);
  const areaRepo = useAreaRepo();
  const projectRepo = useProjectRepo();
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
        <EmptyCard
          action={
            <Link href="/browse" className={buttonClass({ variant: "link" })}>
              Browse
              <Icon name="chevron-right" size={16} className="text-ink-3" />
            </Link>
          }
        >
          This area isn&rsquo;t on this device.
        </EmptyCard>
      </main>
    );
  }
  if (!area) return <Loading />;

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
        title={<InlineTitle value={area.name ?? "Untitled area"} label="Area name" onSave={(n) => void areaRepo.rename(area.id, n)} className="font-display text-title font-book text-balance text-ink" />}
        subtitle={projects ? <span className="num">{`${projects.length} ${projects.length === 1 ? "project" : "projects"}`}</span> : undefined}
      />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(projects ?? []).map((p) => (
          <li key={p.id}>
            <Link href={`/project/${p.id}`} className={cx(PROJECT_CARD, "transition-colors dur-fast hover:border-line-strong active:bg-press")}>
              <span className="text-body-lg font-medium text-ink">{p.name ?? "Untitled project"}</span>
              <span className="flex flex-wrap items-center gap-2 text-body-sm text-ink-2 num">
                <span>
                  {p.open_count} open{p.open_count > 0 && ` · ~${formatMinutes(p.open_min)}`}
                </span>
                {(p.next_deadline ?? p.deadline) && <DeadlineChip deadline={localDate((p.next_deadline ?? p.deadline) as string)} today={today} />}
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
              className={cx(PROJECT_CARD, "border-ink")}
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
                className="bg-transparent text-base font-medium text-ink outline-none placeholder:text-ink-4 focus-visible:outline-none sm:text-body-lg"
              />
              <span className="text-label text-ink-3">Enter to create · Esc to cancel</span>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={cx(PROJECT_CARD, "w-full flex-row items-center justify-center gap-2 text-body-lg text-ink-2 transition-colors dur-fast hover:border-line-strong hover:text-ink active:bg-press")}
            >
              <Icon name="plus" size={16} /> Add project
            </button>
          )}
        </li>
      </ul>
    </main>
  );
}
