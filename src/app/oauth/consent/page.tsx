// The consent screen for a connected app (DECISIONS.md, amendment 2026-10-23). Supabase Auth's OAuth 2.1 server
// sends the person here (the authorization path under the Site URL) with an authorization id; the proxy has them
// sign in first. The screen names the app and where it will send them back, and asks what it may do: read and
// change (the default) or read only. Allow and Deny post to /oauth/decision, which records the choice and answers
// the auth server. A request the person already approved goes straight back.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createUserScopedClient } from "@/server/auth/supabase";
import { Wordmark } from "@/ui/brand";
import { Button } from "@/ui/button";
import { Radio } from "@/ui/radio";

export const metadata: Metadata = { title: "Connect an app · Sparehour" };
export const dynamic = "force-dynamic";

const CARD = "flex w-full max-w-md flex-1 flex-col gap-6 rounded-xl border border-line bg-surface p-6 sm:flex-none sm:p-8";
const P = "text-body text-pretty text-ink-2";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center px-5 pt-14 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:justify-center sm:px-6 sm:py-10">
      <div className={CARD}>
        <Wordmark size="lg" />
        {children}
      </div>
    </main>
  );
}

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <Shell>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-pane font-medium text-balance text-ink">{title}</h1>
        <p className={P}>{text}</p>
      </div>
    </Shell>
  );
}

/** The host a redirect URI goes to, as a person reads it ("claude.ai", "localhost"). */
function hostOf(uri: string): string {
  try {
    return new URL(uri).hostname || uri;
  } catch {
    return uri;
  }
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string; error?: string }> }) {
  const { authorization_id: id, error: failed } = await searchParams;
  if (!id) return <Problem title="Nothing to approve" text="This page opens from an app that is connecting to Sparehour. Start again from the app." />;

  const supabase = await createUserScopedClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return <Problem title="This request has expired" text="It was answered already, or it waited too long. Start connecting again from the app." />;
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const name = data.client.name || "An app";
  const back = hostOf(data.redirect_uri);
  return (
    <Shell>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-pane font-medium text-balance text-ink">Connect {name} to Sparehour</h1>
        <p className={P}>
          {name} will see your tasks, projects, lists and the busy times on your calendar. You are signed in as <strong className="font-medium text-ink">{data.user.email || user.email}</strong>.
        </p>
      </div>
      {failed ? (
        <p role="alert" className="text-body-sm text-pretty text-deadline">
          That didn’t save. Try Allow again.
        </p>
      ) : null}
      <form method="post" action="/oauth/decision" className="flex flex-1 flex-col gap-6">
        <input type="hidden" name="authorization_id" value={id} />
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-2 text-body font-medium text-ink">What may {name} do?</legend>
          <label className="flex cursor-pointer items-start gap-1">
            <Radio name="access" value="write" defaultChecked className="-ml-3 -mt-2.5" />
            <span className="flex flex-col">
              <span className="text-body text-ink">Read and change</span>
              <span className="text-body-sm text-pretty text-ink-2">Add and complete tasks, move them to other days, edit them, and add to your lists.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-1">
            <Radio name="access" value="read" className="-ml-3 -mt-2.5" />
            <span className="flex flex-col">
              <span className="text-body text-ink">Read only</span>
              <span className="text-body-sm text-pretty text-ink-2">See everything, change nothing.</span>
            </span>
          </label>
        </fieldset>
        <p className="text-body-sm text-pretty text-ink-2">
          You’ll go back to <strong className="font-medium text-ink">{back}</strong>. Change this or disconnect at any time in Settings › Connected apps.
        </p>
        <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="submit" name="decision" value="deny" variant="secondary">
            Deny
          </Button>
          <Button type="submit" name="decision" value="allow" variant="primary">
            Allow
          </Button>
        </div>
      </form>
    </Shell>
  );
}
