// The phone app turns this phone's reminders on (POST) or off (DELETE), with
// its sign-in token and the token Expo's push service gave the phone
// (server/push/app-tokens.ts). Browsers never come here: they write their own
// push_subscriptions row.
import { answer, appCaller, jsonBody, unauthenticated } from "@/server/calendar/app-connect";
import { serviceRoleClient } from "@/server/auth/supabase";
import { forgetAppToken, registerAppToken, type TokenAnswer } from "@/server/push/app-tokens";

export const dynamic = "force-dynamic";

const reply = (r: TokenAnswer) => (r.ok ? answer({ ok: true }) : answer({ error: r.error }, r.status));

export async function POST(request: Request) {
  const caller = await appCaller(request);
  if (!caller) return unauthenticated();
  return reply(await registerAppToken(serviceRoleClient(), caller.id, (await jsonBody(request)).token));
}

export async function DELETE(request: Request) {
  const caller = await appCaller(request);
  if (!caller) return unauthenticated();
  return reply(await forgetAppToken(serviceRoleClient(), caller.id, (await jsonBody(request)).token));
}
