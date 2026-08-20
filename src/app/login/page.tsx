import LoginForm from "@/components/LoginForm";

/**
 * Is the app actually pointed at a Supabase project?
 *
 * Checked here rather than left to fail at sign-in, because the failure looks
 * identical to a dead network from inside the browser: the request never
 * reaches a server either way. Telling someone to check their connection when
 * the real problem is an unset env var sends them off debugging their wifi.
 */
function configProblem(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.";
  if (url.includes("placeholder") || key.includes("placeholder")) {
    return "The Supabase URL and key in .env.local are still placeholders.";
  }
  return null;
}

/**
 * The `next` param is read here, on the server, and passed down as a prop.
 *
 * Doing it with useSearchParams in the client component instead makes Next bail
 * the whole subtree out to client-side rendering, which ships an empty page and
 * leaves a teacher on a slow phone looking at blank paper until the JS lands.
 * The sign-in form is the one screen that must render instantly from HTML.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;

  // Only ever redirect to a path on this app — never to whatever a crafted link
  // put in the query string.
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";

  return <LoginForm next={next} setupError={configProblem()} />;
}
