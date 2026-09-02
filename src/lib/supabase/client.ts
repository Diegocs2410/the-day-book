import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types";

/**
 * Supabase client for Client Components.
 *
 * Uses the publishable key, which is meant to be public — it carries no
 * authority of its own. Everything this client can reach is decided by RLS
 * against the signed-in user's JWT, which is why shipping it to the browser is
 * safe and why the policies in the baseline migration are load-bearing.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
