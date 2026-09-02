import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const demoSchema = z.object({ role: z.enum(["seller", "buyer"]) });

/**
 * One-click sign-in to a seeded demo account.
 *
 * A reviewer opening a public repo should be looking at the product inside
 * thirty seconds, not filling in a sign-up form and inventing a password. The
 * two demo accounts are created by `npm run seed` and their credentials live
 * in server-side environment variables, so the browser never handles them.
 *
 * This is a demo affordance, and it is scoped like one: exactly two accounts,
 * named in the environment, and nothing else. It cannot be pointed at an
 * arbitrary email, so it is not a password-free door into any other account.
 * A production build would drop the route entirely.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = demoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown demo role." }, { status: 400 });
  }

  const email =
    parsed.data.role === "seller"
      ? process.env.DEMO_SELLER_EMAIL
      : process.env.DEMO_BUYER_EMAIL;
  const password = process.env.DEMO_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Demo accounts are not configured in this deployment." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json(
      { error: "Demo accounts are not seeded yet. Run `npm run seed`." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    redirectTo: parsed.data.role === "seller" ? "/seller" : "/search",
  });
}
