"use client";
// Settings › Account (SCREENS.md §18): who is signed in, the time zone with a
// "detected" hint, and the way out.
import { useMemo } from "react";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { SectionAction } from "@/ui/section-label";
import { Select } from "@/ui/select";
import { NOTE, ROW, LABEL, VALUE } from "../rows";
import { canonicalZone, timeZoneHint, timeZoneOptions } from "../settings-rules";
import { Section, useSavedFlash } from "../settings-ui";
import type { SettingsFormProps } from "../types";

export function AccountSection(p: SettingsFormProps) {
  const { values } = p;
  const [saved, flash] = useSavedFlash();
  const change = (patch: Parameters<SettingsFormProps["onChange"]>[0]) => {
    p.onChange(patch);
    flash();
  };
  const zones = useMemo(() => timeZoneOptions(values.timezone), [values.timezone]);
  const hint = timeZoneHint(values.timezone, p.detectedTimeZone);
  return (
    <div className="flex flex-col gap-7">
      <Section title="Account" saved={saved}>
        <div className={ROW}>
          <span className={LABEL}>{p.account.name ?? "You"}</span>
          <span className={cx(VALUE, "min-w-0 truncate")}>{p.account.email ?? "—"}</span>
        </div>
        <div className={ROW}>
          <label htmlFor="tz" className={LABEL}>
            Time zone
          </label>
          {/* On the phone the select takes the row's full width under its label; beside it from `sm` up. */}
          <span className="flex w-full min-w-0 flex-col items-end gap-1 sm:w-auto">
            <Select id="tz" value={values.timezone} onChange={(e) => change({ timezone: e.target.value })} className="w-full sm:w-auto sm:max-w-64">
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
            {hint && <SectionAction onClick={() => change({ timezone: canonicalZone(p.detectedTimeZone as string) })}>{hint} — use it</SectionAction>}
          </span>
        </div>
      </Section>

      <section className="flex flex-col gap-2">
        {p.unsynced ? (
          // Signing out clears this device; anything not uploaded yet would go with it (PRODUCT_SPEC.md §5.4: offline work is kept).
          <div role="alert" className="flex flex-col gap-3">
            <p className="text-body text-pretty text-ink">
              {p.unsynced === 1 ? "1 change hasn’t" : `${p.unsynced} changes haven’t`} reached your account yet. Signing out now loses {p.unsynced === 1 ? "it" : "them"}.
            </p>
            <p className={NOTE}>Once you’re back online it syncs by itself, then signing out is safe.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={p.onStaySignedIn}>
                Stay signed in
              </Button>
              <Button variant="secondary" tone="destructive" onClick={p.onSignOutAnyway} disabled={p.signingOut}>
                {p.unsynced === 1 ? "Sign out and lose it" : "Sign out and lose them"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Button variant="secondary" onClick={p.onSignOut} disabled={p.signingOut} className="self-start">
              {p.signingOut ? "Signing out…" : "Sign out"}
            </Button>
            <p className={NOTE}>Signing out removes your data from this device. It stays safe in your account.</p>
          </>
        )}
      </section>
    </div>
  );
}
