import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Used by exactly one place: src/app/login/page.tsx.
 *
 * Sign-in has to happen in the browser so the session lands in cookies the
 * middleware can then read. Everything else — every read, every write — goes
 * through a server component or a server action. Do not reach for this to
 * "quickly" fetch something from a client component.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
