// The build's identity, stamped at build time. Its own module so screens that
// only show the version (Settings) do not pull the sync connector — and the
// auth client behind it — into their shell (SYSTEM_DESIGN.md §11.6).
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
