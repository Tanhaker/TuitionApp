import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { USER_HEADER } from "@/lib/user-header";

/**
 * The signed-in teacher's id, for server components.
 *
 * Read from a header the proxy set after it called getUser(), rather than by
 * calling getUser() a second time. getUser() is a network round trip to the
 * Supabase auth server, and every page was paying for two of them in sequence
 * before it could even start querying.
 *
 * This is safe for two reasons. The proxy strips any inbound copy of the header
 * before setting its own, so a client cannot inject one. And the id is only
 * ever used to decide which rows to ask for — RLS still checks the real
 * identity from the cookie at the database, so a wrong id here returns nothing
 * rather than someone else's data.
 */
export async function requireUserId(): Promise<string> {
  const id = (await headers()).get(USER_HEADER);
  if (!id) redirect("/login");
  return id;
}
