"use client";
// Browse (SCREENS.md §1 "Responsive", §22): the sidebar's phone form. A
// search field, then areas with their projects (and, collapsed, the
// completed and archived ones), then Someday, Logbook, Carried over and
// Settings. Reachable on any width; on a desktop the palette's "Add area" and
// "Add project" open its forms (`?add=area`, `?add=project`).
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@/data/powersync";
import { FINISHED_PROJECTS_SQL, type ProjectStateRow } from "@/data/queries/nav";
import { FinishedProjects } from "@/features/projects/finished-projects";
import { useNavData } from "@/features/shell/use-nav-data";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { useAreaRepo, useProjectRepo } from "@/features/tasks/use-repos";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Input } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { EmptyCard, ListCard } from "@/ui/list-card";
import { SectionAction, SectionLabel } from "@/ui/section-label";
import { browseRows } from "./browse-rows";

// One row look for areas, projects and views: 44 px, a hairline above, the chevron a step quieter.
// The wash stays inside the card (it clips), so the focus ring is drawn inside the row too.
const ROW = "flex min-h-11 items-center gap-3 px-4 text-body-lg text-ink transition-colors dur-fast hover:bg-hover focus-visible:-outline-offset-2 active:bg-press";
const CHEVRON = <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3" />;
const SPACE_SQL = `select personal_space_id from users limit 1`;

type Adding = "area" | "project" | null;

/** Opens a form named in the URL once, then takes the parameter off so the palette can ask again. */
function AddFromQuery({ onAdd }: { onAdd: (what: Exclude<Adding, null>) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const add = params.get("add");
  useEffect(() => {
    if (add !== "area" && add !== "project") return;
    onAdd(add);
    router.replace("/browse", { scroll: false });
  }, [add, onAdd, router]);
  return null;
}

export default function BrowsePage() {
  const { areas } = useNavData();
  const router = useRouter();
  const areaRepo = useAreaRepo();
  const projectRepo = useProjectRepo();
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const { data: finished } = useQuery<ProjectStateRow>(FINISHED_PROJECTS_SQL);
  const spaceId = users?.[0]?.personal_space_id ?? null;
  const [adding, setAdding] = useState<Adding>(null);
  const [name, setName] = useState("");
  const create = () => {
    const n = name.trim();
    const what = adding;
    setAdding(null);
    setName("");
    if (!n || !spaceId || !what) return;
    if (what === "area") void areaRepo.create(n, { spaceId });
    // A project made here has no area yet; it opens, so its first task can go straight in.
    else void projectRepo.create(n, { spaceId }).then((id) => router.push(`/project/${id}`));
  };
  const cancel = () => {
    setName("");
    setAdding(null);
  };
  const addAction = (
    <>
      <Icon name="plus" size={14} /> Add area
    </>
  );
  return (
    <main className={VIEW_COLUMN}>
      <Suspense fallback={null}>
        <AddFromQuery onAdd={setAdding} />
      </Suspense>
      <ViewHeader eyebrow="Browse" title="Everything else" />
      <Link
        href="/search"
        className="flex h-11 w-full items-center gap-3 rounded-lg border border-line-strong bg-surface px-3.5 text-left text-body-lg text-ink-3 transition-colors dur-fast hover:border-line-control hover:text-ink-2 active:bg-press"
      >
        <Icon name="search" size={18} className="shrink-0 text-ink-2" />
        Search tasks, notes, projects
      </Link>
      <section className="flex flex-col gap-2">
        <SectionLabel className="px-0.5" action={!adding && areas.length > 0 && <SectionAction onClick={() => setAdding("area")}>{addAction}</SectionAction>}>
          Areas
        </SectionLabel>
        {adding && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <Input
              key={adding}
              autoFocus
              aria-label={adding === "area" ? "Area name" : "Project name"}
              placeholder={adding === "area" ? "Area name" : "Project name"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={create}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancel();
              }}
            />
          </form>
        )}
        {areas.length === 0 && !adding ? (
          <EmptyCard
            action={
              <Button variant="link" onClick={() => setAdding("area")}>
                {addAction}
              </Button>
            }
          >
            No areas yet.
          </EmptyCard>
        ) : (
          areas.length > 0 && (
            <ListCard className="overflow-clip">
              {areas.map((a) => (
                <li key={a.id} className="border-t border-line first:border-t-0">
                  {a.loose ? (
                    // Projects without an area: a heading for the rows under it, with no page of its own.
                    <p className="flex min-h-11 items-center gap-3 px-4 text-body-lg font-medium text-ink">
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className="text-body-sm text-ink-3 num">{a.projects.length}</span>
                    </p>
                  ) : (
                    <Link href={`/area/${a.id}`} className={cx(ROW, "font-medium")}>
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      {a.projects.length > 0 && <span className="text-body-sm text-ink-3 num">{a.projects.length}</span>}
                      {CHEVRON}
                    </Link>
                  )}
                  {a.projects.length > 0 && (
                    <ul>
                      {a.projects.map((p) => (
                        <li key={p.id}>
                          <Link href={`/project/${p.id}`} className={cx(ROW, "pl-9 text-ink-2")}>
                            {/* The same 6 px dot the sidebar gives a project, so the nesting reads the same everywhere. */}
                            <span className="size-1.5 shrink-0 rounded-full bg-line-control" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{p.name}</span>
                            {CHEVRON}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ListCard>
          )
        )}
        <FinishedProjects projects={finished ?? []} />
      </section>
      <section>
        <ListCard className="overflow-clip">
          {browseRows().map((v) => (
            <li key={v.id} className="border-t border-line first:border-t-0">
              <Link href={v.href} className={ROW}>
                <Icon name={v.icon} size={18} className="shrink-0 text-ink-2" />
                <span className="min-w-0 flex-1 truncate">{v.label}</span>
                {CHEVRON}
              </Link>
            </li>
          ))}
        </ListCard>
      </section>
    </main>
  );
}
