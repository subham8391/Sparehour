"use client";
// Settings › Account (SCREENS.md §18): who is signed in — the picture or the
// initials, the name and email, and the sign-in methods linked to the account
// — the time zone with a "detected" hint, and the ways out: Sign out, and
// Delete account behind a typed confirmation (its sheet is an island of its own).
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/features/account/avatar";
import { preloadOnIdle } from "@/features/shell/preload-on-idle";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { SectionAction } from "@/ui/section-label";
import { Select } from "@/ui/select";
import { HINT, NOTE, ROW, LABEL, VALUE } from "../rows";
import { canonicalZone, timeZoneHint, timeZoneOptions } from "../settings-rules";
import { Section, useSavedFlash } from "../settings-ui";
import type { SettingsFormProps } from "../types";

const loadDeleteSheet = () => import("@/features/account/delete-account-sheet");
const DeleteAccountSheet = dynamic(loadDeleteSheet, { ssr: false });

/** The linked sign-in methods: asked once Account opens, never in a shell's first download. */
function useSignInMethods(load: SettingsFormProps["signInMethods"]): string[] | "unknown" | null {
  const [methods, setMethods] = useState<string[] | "unknown" | null>(null);
  useEffect(() => {
    if (!load) return;
    let live = true;
    load().then(
      (m) => live && setMethods(m),
      () => live && setMethods("unknown"),
    );
    return () => {
      live = false;
    };
  }, [load]);
  return methods;
}

export function AccountSection(p: SettingsFormProps) {
  const { values } = p;
  const [saved, flash] = useSavedFlash();
  const [deleting, setDeleting] = useState(false);
  const change = (patch: Parameters<SettingsFormProps["onChange"]>[0]) => {
    p.onChange(patch);
    flash();
  };
  const zones = useMemo(() => timeZoneOptions(values.timezone), [values.timezone]);
  const hint = timeZoneHint(values.timezone, p.detectedTimeZone);
  const methods = useSignInMethods(p.signInMethods);
  // The delete sheet is fetched once the browser is idle, so it opens at once and offline.
  useEffect(() => preloadOnIdle(loadDeleteSheet), []);
  return (
    <div className="flex flex-col gap-7">
      <Section title="Account" saved={saved}>
        <div className={ROW}>
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar url={p.account.avatarUrl} name={p.account.name} email={p.account.email} />
            <span className="flex min-w-0 flex-col">
              <span className={cx(LABEL, "truncate")}>{p.account.name ?? "You"}</span>
              <span className={cx(VALUE, "truncate")}>{p.account.email ?? "—"}</span>
            </span>
          </span>
        </div>
        {p.signInMethods && (
          <div className={ROW}>
            <span className={LABEL}>Signed in with</span>
            {methods === null ? (
              <span className={cx(VALUE, "text-ink-3")}>Checking…</span>
            ) : methods === "unknown" || methods.length === 0 ? (
              <span className={HINT}>Shown when you’re online</span>
            ) : (
              <span className={VALUE}>{methods.join(" · ")}</span>
            )}
          </div>
        )}
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

      <section aria-label="Delete account" className="flex flex-col gap-2">
        <Button variant="secondary" tone="destructive" onClick={() => setDeleting(true)} className="self-start">
          Delete account
        </Button>
        <p className={NOTE}>Everything in your account goes, after 30 days to change your mind.</p>
      </section>
      {deleting && (
        <DeleteAccountSheet
          onClose={() => setDeleting(false)}
          exporter={p.data && { onExport: () => p.data?.onExport("json"), busy: p.data.busy !== null, error: p.data.error, lastFile: p.data.lastFile }}
        />
      )}
    </div>
  );
}
