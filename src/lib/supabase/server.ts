import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server client, for server components and server actions.
 *
 * Async because `cookies()` is async from Next 15 onwards — every caller
 * does `const supabase = await createClient()`.
 *
 * This runs as the signed-in teacher under the anon key, so RLS applies to
 * everything it does. That is the security model: there is no service-role
 * client anywhere in this app, and adding one would bypass every policy in
 * supabase/schema.sql.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a server component, which cannot set cookies.
            // Harmless: the middleware refreshes the session on every request,
            // so the cookie is already up to date by the time we get here.
          }
        },
      },
    }
  );
}
