"use client";
// Completed and archived projects (PRODUCT_SPEC.md §6 "Archiving is
// reversible and keeps everything"): out of the way in a collapsed group on
// Browse and on their area's page, but always reachable. Their own page is
// where "Back to active" lives.
import Link from "next/link";
import { projectStateLabel, type ProjectStateRow } from "@/data/queries/nav";
import { Chip } from "@/ui/chip";
import { CollapsedGroup } from "@/ui/collapsed-group";
import { Icon } from "@/ui/icons";
import { ListCard } from "@/ui/list-card";

export function FinishedProjects({ projects, className }: { projects: readonly ProjectStateRow[]; className?: string }) {
  if (projects.length === 0) return null;
  return (
    <CollapsedGroup label="Completed and archived" count={projects.length} className={className}>
      <ListCard className="overflow-clip">
        {projects.map((p) => {
          const state = projectStateLabel(p.state);
          return (
            <li key={p.id} className="border-t border-line first:border-t-0">
              <Link
                href={`/project/${p.id}`}
                className="flex min-h-11 items-center gap-3 px-4 text-body-lg text-ink-2 transition-colors dur-fast hover:bg-hover focus-visible:-outline-offset-2 active:bg-press"
              >
                {/* The project dot, as in the sidebar and Browse. */}
                <span className="size-1.5 shrink-0 rounded-full bg-line-control" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{p.name ?? "Untitled project"}</span>
                {state && (
                  <Chip size="auto" className="shrink-0 text-ink-3">
                    {state}
                  </Chip>
                )}
                <Icon name="chevron-right" size={16} className="shrink-0 text-ink-3" />
              </Link>
            </li>
          );
        })}
      </ListCard>
    </CollapsedGroup>
  );
}
