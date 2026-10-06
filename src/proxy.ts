// Next.js 16 proxy (formerly middleware): refresh the Supabase session cookie
// on every request and keep the app behind sign-in. RLS remains the real
// security boundary; this is convenience, not protection.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { deleteAfter } from "@/features/account/deletion";
import { safeNext } from "@/features/auth/safe-next";

// /account holds the page for an account waiting for deletion, signed in or not; /privacy is readable by anyone.
const PUBLIC_PATHS = ["/", "/login", "/auth", "/account", "/privacy"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!user && !isPublic && !path.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // The whole destination, query included (/search?q=dentist comes back with its query), and nothing else on /login.
    url.search = "";
    url.searchParams.set("next", `${path}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }
  // An account waiting for deletion (SYSTEM_DESIGN.md §9.6) sees only the page that offers Restore; the APIs refuse it.
  const waiting = user ? deleteAfter(user.app_metadata) : null;
  if (waiting && !path.startsWith("/api/") && !path.startsWith("/account") && !path.startsWith("/auth") && path !== "/privacy") {
    const away = NextResponse.redirect(new URL("/account/deleted", request.url));
    for (const cookie of response.cookies.getAll()) away.cookies.set(cookie);
    return away;
  }
  // Someone already signed in who opens the sign-in page (a bookmark, Back) goes on into the app (ONBOARDING.md §1a).
  if (user && path === "/login") {
    const onward = NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
    for (const cookie of response.cookies.getAll()) onward.cookies.set(cookie);
    return onward;
  }
  return response;
}

export const config = {
  // /powersync/* is the sync service behind a rewrite (next.config.ts): it authenticates its own
  // bearer token, and a redirect to /login would hand the sync worker an HTML page instead.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|powersync/|.*\\.(?:png|svg|ico|wasm|js)$).*)"],
};
