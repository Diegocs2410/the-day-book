import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh on every request.
 *
 * Named `proxy.ts` with an exported `proxy` function: Next.js 16 renamed
 * middleware, and the old filename is simply not picked up.
 *
 * The only job here is to let Supabase rotate an expiring access token and
 * write the refreshed cookies onto the response. Route protection is not done
 * here — it is done by RLS, which cannot be bypassed by a request that dodges
 * the matcher. A redirect for a signed-out visitor is a courtesy; the policies
 * are the guarantee.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getUser, never getSession: only this verifies the JWT with the auth server.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
