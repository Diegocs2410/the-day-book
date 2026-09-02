import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Used in exactly two places, both of which have no user to act as:
 *
 *   - `scripts/seed.mts`, which creates the demo accounts and their data.
 *   - the demo sign-in route, which needs to look up a seeded account before
 *     anyone is signed in.
 *
 * Never import this into a Client Component. It is server-only by construction
 * — the key it needs has no `NEXT_PUBLIC_` prefix, so a bundle that reached
 * for it would fail at runtime rather than leak — but the rule is worth
 * stating: when a route uses this, authorization is the route's own code, not
 * the database. Authenticate, check ownership, and only then write.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "createAdminClient needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. See .env.example.",
    );
  }

  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
