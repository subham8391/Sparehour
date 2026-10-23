"use client";
// Settings' sections as `next/dynamic` islands (SYSTEM_DESIGN.md §11.6): the
// Settings shell carries only the section list and its summaries; each
// section's controls load when it is opened, and all of them are fetched once
// the browser is idle so opening one never waits on the network and works
// offline.
import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { SectionKey } from "./sections";
import type { SettingsFormProps } from "./types";

const opening = () => <p className="text-body text-ink-3">Opening…</p>;

const load = {
  account: () => import("./sections/account-section").then((m) => m.AccountSection),
  "working-hours": () => import("./sections/hours-section").then((m) => m.HoursSection),
  calendar: () => import("./sections/calendar-section").then((m) => m.CalendarSection),
  connections: () => import("./sections/connections-section").then((m) => m.ConnectionsSection),
  notifications: () => import("./sections/notifications-section").then((m) => m.NotificationsSection),
  planning: () => import("./sections/planning-section").then((m) => m.PlanningSection),
  appearance: () => import("./sections/appearance-section").then((m) => m.AppearanceSection),
  data: () => import("./sections/data-section").then((m) => m.DataSection),
  app: () => import("./sections/app-section").then((m) => m.AppSection),
  about: () => import("./sections/about-section").then((m) => m.AboutSection),
} satisfies Record<SectionKey, () => Promise<ComponentType<SettingsFormProps>>>;

export const SECTION_VIEWS: Record<SectionKey, ComponentType<SettingsFormProps>> = {
  account: dynamic(() => import("./sections/account-section").then((m) => m.AccountSection), { ssr: false, loading: opening }),
  "working-hours": dynamic(() => import("./sections/hours-section").then((m) => m.HoursSection), { ssr: false, loading: opening }),
  calendar: dynamic(() => import("./sections/calendar-section").then((m) => m.CalendarSection), { ssr: false, loading: opening }),
  connections: dynamic(() => import("./sections/connections-section").then((m) => m.ConnectionsSection), { ssr: false, loading: opening }),
  notifications: dynamic(() => import("./sections/notifications-section").then((m) => m.NotificationsSection), { ssr: false, loading: opening }),
  planning: dynamic(() => import("./sections/planning-section").then((m) => m.PlanningSection), { ssr: false, loading: opening }),
  appearance: dynamic(() => import("./sections/appearance-section").then((m) => m.AppearanceSection), { ssr: false, loading: opening }),
  data: dynamic(() => import("./sections/data-section").then((m) => m.DataSection), { ssr: false, loading: opening }),
  app: dynamic(() => import("./sections/app-section").then((m) => m.AppSection), { ssr: false, loading: opening }),
  about: dynamic(() => import("./sections/about-section").then((m) => m.AboutSection), { ssr: false, loading: opening }),
};

/** Every section's module, for the idle prefetch. */
export const loadAllSections = () => Promise.all(Object.values(load).map((l) => l()));
