// A task's link (DECISIONS.md "Copy link"): Today with that task's detail open, on any device signed in. Its own
// module, free of the island that copies it in the browser (organize-island.tsx), so the Android app hands on the
// same address (docs/mobile/ANDROID_APP_SPEC.md §4.3).

/** `<origin>/today?task=<id>`. */
export const taskLinkAt = (origin: string, id: string): string => `${origin}/today?task=${encodeURIComponent(id)}`;
