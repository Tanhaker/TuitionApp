import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { USER_HEADER } from "@/lib/user-header";

/** Routes reachable without a session. Everything else needs one. */
const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Refreshes the auth token on every request, redirects signed-out users to
 * /login, and passes the verified user id downstream so pages do not have to
 * ask the auth server all over again.
 *
 * The response object matters here: `supabase.auth.getUser()` may issue a
 * refreshed cookie, and it has to be written onto the SAME response we return,
 * or the teacher gets silently signed out on the next navigation. That is why
 * the redirects below copy the cookies across instead of returning a fresh
 * NextResponse.
 */
export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // Strip any inbound copy before we set our own. Without this a client could
  // send the header themselves and choose which teacher the pages think they
  // are — RLS would still block the data, but the pages would misbehave.
  requestHeaders.delete(USER_HEADER);

  let cookiesToApply: { name: string; value: string; options?: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToApply = cookiesToSet;
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        },
      },
    }
  );

  // Do not remove: this call is what actually refreshes the session, and it is
  // the one place the token is verified against the auth server.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) requestHeaders.set(USER_HEADER, user.id);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const { name, value, options } of cookiesToApply) {
    response.cookies.set(name, value, options);
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // clone() keeps the original query string, which would leave /login wearing
    // the params of whatever page bounced us here (?days=90&next=...). Clear it
    // and carry the destination in `next` alone.
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}
