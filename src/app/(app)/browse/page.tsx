"use client";
// Browse (SCREENS.md §1 "Responsive"): the sidebar's phone form. A search
// field, then areas with their projects, then Someday, Logbook and Settings.
// Reachable on any width.
import Link from "next/link";
import { useMemo, useState } from "react";
import { useLocalDatabase, useQuery } from "@/data/powersync";
import { AreaRepo } from "@/data/repositories/area-repo";
import { BROWSE_VIEWS } from "@/features/shell/nav";
import { VIEW_ICONS } from "@/features/shell/sidebar";
import { useNavData } from "@/features/shell/use-nav-data";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Input } from "@/ui/field";
import { Icon } from "@/ui/icons";
import { EmptyCard, ListCard } from "@/ui/list-card";
import { SectionAction, SectionLabel } from "@/ui/section-label";

// One row look for areas, projects and views: 44 px, a hairline above, the chevron a step quieter.
// The wash stays inside the card (it clips), so the focus ring is drawn inside the row too.
const ROW = "flex min-h-11 items-center gap-3 px-4 text-body-lg text-ink transition-colors dur-fast hover:bg-hover focus-visible:-outline-offset-2 active:bg-press";
const CHEVRON = <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3" />;
const SPACE_SQL = `select personal_space_id from users limit 1`;

export default function BrowsePage() {
  const { areas } = useNavData();
  const db = useLocalDatabase();
  const areaRepo = useMemo(() => new AreaRepo(db), [db]);
  const { data: users } = useQuery<{ personal_space_id: string | null }>(SPACE_SQL);
  const spaceId = users?.[0]?.personal_space_id ?? null;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const createArea = () => {
    const n = name.trim();
    setAdding(false);
    setName("");
    if (!n || !spaceId) return;
    void areaRepo.create(n, { spaceId });
  };
  const addAction = (
    <>
      <Icon name="plus" size={14} /> Add area
    </>
  );
  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Browse" title="Everything else" />
      <Link
        href="/search"
        className="flex h-11 w-full items-center gap-3 rounded-lg border border-line-strong bg-surface px-3.5 text-left text-body-lg text-ink-3 transition-colors dur-fast hover:border-line-control hover:text-ink-2 active:bg-press"
      >
        <Icon name="search" size={18} className="shrink-0 text-ink-2" />
        Search tasks, notes, projects
      </Link>
      <section className="flex flex-col gap-2">
        <SectionLabel className="px-0.5" action={!adding && areas.length > 0 && <SectionAction onClick={() => setAdding(true)}>{addAction}</SectionAction>}>
          Areas
        </SectionLabel>
        {adding && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createArea();
            }}
          >
            <Input
              autoFocus
              aria-label="Area name"
              placeholder="Area name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={createArea}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setName("");
                  setAdding(false);
                }
              }}
            />
          </form>
        )}
        {areas.length === 0 && !adding ? (
          <EmptyCard
            action={
              <Button variant="link" onClick={() => setAdding(true)}>
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
                  <Link href={`/area/${a.id}`} className={cx(ROW, "font-medium")}>
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    {a.projects.length > 0 && <span className="text-body-sm text-ink-3 num">{a.projects.length}</span>}
                    {CHEVRON}
                  </Link>
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
      </section>
      <section>
        <ListCard className="overflow-clip">
          {BROWSE_VIEWS.map((v) => (
            <li key={v.id} className="border-t border-line first:border-t-0">
              <Link href={v.href} className={ROW}>
                <Icon name={VIEW_ICONS[v.id]} size={18} className="shrink-0 text-ink-2" />
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
