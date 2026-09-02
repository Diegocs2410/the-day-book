import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types";

/**
 * Supabase client for Server Components and Route Handlers.
 *
 * This one goes through RLS, so what it can see is exactly what the signed-in
 * user is allowed to see. Prefer it everywhere; reach for the admin client
 * only where a route genuinely has to act outside a user's permissions, and
 * say why at the call site.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. The proxy refreshes the
            // session instead, so this is expected rather than swallowed.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null.
 *
 * Always `getUser()`, never `getSession()`: only the former verifies the JWT
 * against the auth server. `getSession()` reads a cookie the browser sent,
 * which is exactly the thing an attacker controls.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The signed-in user's profile, or null when signed out. */
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data;
}
