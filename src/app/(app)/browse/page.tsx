"use client";
// Browse (SCREENS.md §1 "Responsive"): the sidebar's phone form — areas and
// projects, then Someday, Logbook and Settings. Reachable on any width.
import Link from "next/link";
import { BROWSE_VIEWS } from "@/features/shell/nav";
import { VIEW_ICONS } from "@/features/shell/sidebar";
import { useNavData } from "@/features/shell/use-nav-data";
import { EmptyState, ViewHeader } from "@/features/shell/view-header";
import { Icon } from "@/ui/icons";

const ROW = "flex min-h-11 items-center gap-3 border-t border-line px-4 text-[15px] text-ink first:border-t-0";

export default function BrowsePage() {
  const { areas } = useNavData();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-10">
      <ViewHeader eyebrow="Browse" title="Everything else" />
      <section className="flex flex-col gap-2">
        <h2 className="px-0.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Areas</h2>
        {areas.length === 0 ? (
          <EmptyState>No areas yet.</EmptyState>
        ) : (
          <ul className="rounded-xl border border-line bg-surface">
            {areas.map((a) => (
              <li key={a.id} className="border-t border-line first:border-t-0">
                <Link href={`/area/${a.id}`} className={`${ROW} border-t-0 font-medium`}>
                  <span className="flex-1">{a.name}</span>
                  <Icon name="chevron-right" size={16} className="text-ink-3" />
                </Link>
                {a.projects.length > 0 && (
                  <ul>
                    {a.projects.map((p) => (
                      <li key={p.id}>
                        <Link href={`/project/${p.id}`} className={`${ROW} border-t-0 pl-9 text-ink-2`}>
                          <span className="size-1.5 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
                          <span className="flex-1">{p.name}</span>
                          <Icon name="chevron-right" size={16} className="text-ink-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <ul className="rounded-xl border border-line bg-surface">
          {BROWSE_VIEWS.map((v) => (
            <li key={v.id}>
              <Link href={v.href} className={ROW}>
                <Icon name={VIEW_ICONS[v.id]} size={18} className="text-ink-2" />
                <span className="flex-1">{v.label}</span>
                <Icon name="chevron-right" size={16} className="text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
