"use client";
// Settings › Appearance (SCREENS.md §18): Light / Dark / System, and reduce
// motion — System follows the device's own setting, Reduce cuts movement in
// this app on this device (M1 gap rulings). Density waits for M2.
import { Segmented } from "@/ui/segmented";
import { HINT, LABEL, ROW } from "../rows";
import { Section, useSavedFlash } from "../settings-ui";
import type { SettingsFormProps } from "../types";

export function AppearanceSection(p: SettingsFormProps) {
  const [saved, flash] = useSavedFlash();
  return (
    <Section title="Appearance" saved={saved}>
      <div className={ROW}>
        <span className={LABEL}>Theme</span>
        <Segmented
          label="Theme"
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "System" },
          ]}
          value={p.values.theme}
          onChange={(theme) => {
            p.onChange({ theme });
            flash();
          }}
        />
      </div>
      {p.motion && (
        <div className={ROW}>
          <span className="flex min-w-0 flex-col">
            <span className={LABEL}>Motion</span>
            <span className={HINT}>{p.motion.value === "reduce" ? "Movement is cut on this device" : "Follows this device’s setting"}</span>
          </span>
          <Segmented
            label="Motion"
            options={[
              { value: "system", label: "System" },
              { value: "reduce", label: "Reduce" },
            ]}
            value={p.motion.value}
            onChange={(m) => {
              p.motion?.onChange(m);
              flash();
            }}
          />
        </div>
      )}
    </Section>
  );
}
