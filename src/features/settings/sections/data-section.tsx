"use client";
// Settings › Data (SCREENS.md §18, PRODUCT_SPEC.md §19.1, §6, §8.5): one-click
// export in three formats, from this device, no server needed; then Clear the
// slate, the Archive with a restore per batch, and Delete permanently.
import { ArchivePanel } from "@/features/archive/archive-panel";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { ERROR, HINT, LABEL, NOTE, ROW } from "../rows";
import { Section } from "../settings-ui";
import type { SettingsFormProps } from "../types";

const FORMATS = [
  ["json", "JSON"],
  ["markdown", "Markdown"],
  ["csv", "CSV"],
] as const;

export function DataSection(p: SettingsFormProps) {
  const data = p.data;
  if (!data) return null;
  return (
    <div className="flex flex-col gap-7">
      <Section id="data" title="Data">
        <div className={cx(ROW, "flex-col items-stretch gap-y-2")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className={LABEL}>Export everything</span>
              <span className={HINT}>Tasks, checklists, projects, areas, tags, blocks, day plans and settings, from this device — no server needed.</span>
            </span>
            <span className="flex flex-wrap gap-2">
              {FORMATS.map(([format, label]) => (
                <Button key={format} variant="secondary" onClick={() => data.onExport(format)} disabled={data.busy !== null}>
                  {data.busy === format ? "Preparing…" : label}
                </Button>
              ))}
            </span>
          </div>
          <p className={NOTE}>JSON is complete and re-importable. Markdown is one file per project, zipped. CSV is the flat task table.</p>
          {data.lastFile && (
            <p role="status" className={HINT}>
              Saved {data.lastFile}
            </p>
          )}
          {data.error && <p className={ERROR}>{data.error}</p>}
        </div>
      </Section>
      <ArchivePanel timezone={p.values.timezone} dayRolloverHour={p.values.dayRolloverHour} />
    </div>
  );
}
