"use client";
// Share to Sparehour (the manifest's share_target, Android): another app's share sheet opens this page with what was
// shared. It becomes one quick-add line — the words as the name, the link as the note — and the sheet opens holding
// it over the Inbox, where the task lands. The sheet is where it is named, dated and saved, as any task is.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { useQuickAdd } from "@/features/quickadd/quick-add-provider";
import { sharedLine, sharedWords } from "@/features/share/shared";
import { VIEW_COLUMN, ViewHeader } from "@/features/shell/view-header";
import { buttonClass } from "@/ui/button";

export default function SharePage() {
  return (
    <Suspense>
      <ShareScreen />
    </Suspense>
  );
}

function ShareScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const quickAdd = useQuickAdd();
  const line = useMemo(() => sharedLine(sharedWords({ title: params.get("title"), text: params.get("text"), url: params.get("url") })), [params]);
  // Once per share: the sheet opens on the words, and the Inbox is what is behind it when it closes.
  const sent = useRef(false);
  useEffect(() => {
    if (!line || sent.current) return;
    sent.current = true;
    quickAdd.open(line);
    router.replace("/inbox");
  }, [line, quickAdd, router]);

  if (line) return null;
  return (
    <main className={VIEW_COLUMN}>
      <ViewHeader eyebrow="Share" title="Nothing came through" subtitle="The app you shared from sent no words or link." />
      <Link href="/today" className={buttonClass({ variant: "secondary" })}>
        Go to Today
      </Link>
    </main>
  );
}
