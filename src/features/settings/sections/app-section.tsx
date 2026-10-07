"use client";
// Settings › App (SYSTEM_DESIGN.md §10.4–10.5): install, whether this
// device's storage is protected from cleanup, and the version.
import { persistenceCopy } from "@/features/pwa/install";
import { InstallCoaching } from "@/features/pwa/install-coaching";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icons";
import { HINT, LABEL, ROW, VALUE } from "../rows";
import { Section } from "../settings-ui";
import type { SettingsFormProps } from "../types";

export function AppSection(p: SettingsFormProps) {
  const app = p.app;
  if (!app) return null;
  return (
    <Section title="App">
      <div className={cx(ROW, "flex-col items-stretch gap-y-2")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={LABEL}>Install</span>
          {app.install.kind === "installed" && <span className={VALUE}>Installed</span>}
          {app.install.kind === "prompt" && (
            <Button variant="primary" onClick={app.onInstall}>
              Install Sparehour
            </Button>
          )}
          {app.install.kind === "browser-menu" && <span className={HINT}>Use your browser&rsquo;s Install option</span>}
        </div>
        {app.install.kind === "coach-ios" && <InstallCoaching steps={app.install.steps} />}
        {app.install.kind === "coach-safari" && (
          <ol className="list-decimal pl-5 text-body-sm text-ink-2">
            {app.install.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
      </div>
      <div className={ROW}>
        <span className={LABEL}>Storage</span>
        {/* A storage note is a note, not a failure: ink-2 and the alert glyph, never amber (ruling R1). */}
        <span className="flex items-start gap-1.5 text-body-sm text-pretty text-ink-2 sm:text-right">
          {app.persistence === "unprotected" && <Icon name="alert" size={14} className="mt-0.5 shrink-0" />}
          {persistenceCopy(app.persistence, app.install.kind === "installed")}
        </span>
      </div>
      <div className={ROW}>
        <span className={LABEL}>Version</span>
        <span className={VALUE}>{app.version}</span>
      </div>
    </Section>
  );
}
