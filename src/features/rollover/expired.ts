// Today's expired digest as data and words (PRODUCT_SPEC.md §8.2 rule 5): which rows it reads and what it says.
// None of the banner's drawing (features/today/expired-digest.tsx), so the Android app's line reads and says the
// same (docs/mobile/ANDROID_APP_SPEC.md §4).

/** The time-sensitive tasks a rollover dropped, by the stamp of the run that dropped them. */
export const EXPIRED_SQL = `select expired_at from tasks where deleted_at is null and state = 'dropped' and expired_at is not null`;

/** "2 time-sensitive tasks expired overnight" */
export const expiredLine = (count: number): string => `${count === 1 ? "1 time-sensitive task" : `${count} time-sensitive tasks`} expired overnight`;
