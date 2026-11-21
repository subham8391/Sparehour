// The number on the Inbox tab's badge: how many tasks wait in the Inbox. The count is the web app's own statement
// (../../../src/data/queries/nav.ts, the one its sidebar and tab bar read through use-nav-data.ts), read from the
// phone's database and kept current by it. The web shows it only above zero: `countLabel` in
// ../../../src/features/shell/nav.ts turns this number into the badge's words, or into nothing at zero.
import { useQuery } from "@/data/powersync";
import { INBOX_COUNT_SQL } from "@/data/queries/nav";

export function useInboxCount(): number {
  const { data } = useQuery<{ n: number }>(INBOX_COUNT_SQL);
  return data?.[0]?.n ?? 0;
}
