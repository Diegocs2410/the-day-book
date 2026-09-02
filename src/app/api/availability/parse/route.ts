import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  MAX_INPUT_CHARS,
  describeRules,
  parseAvailability,
} from "@/lib/ai/parse-availability";

const requestSchema = z.object({
  text: z.string().max(MAX_INPUT_CHARS * 2),
});

/**
 * Turn a sentence into availability rules.
 *
 * Sign-in is required even though nothing is written and no user data is read.
 * The reason is cost: this is the one route that spends money per call, and an
 * open endpoint that calls a model is an open endpoint that bills its owner.
 * Requiring a session, plus the per-session rate limit below, keeps a
 * publicly-linked demo from turning into an invoice.
 */

/**
 * Rate limit, in memory, per user.
 *
 * In memory is the honest choice for a one-day build with one deployment
 * target, and it is worth naming what that costs: serverless instances do not
 * share this map, so the real limit is per instance, and it resets on cold
 * start. It stops a stuck retry loop and a curious visitor. It would not stop
 * a determined one — that wants Redis or Postgres, which is a deliberate
 * omission rather than an oversight.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, number[]>();

function overLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to use the natural-language box." },
      { status: 401 },
    );
  }

  if (overLimit(user.id)) {
    return NextResponse.json(
      { error: "Too many requests. Use the grid below, or try again in a minute." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Nothing to read." }, { status: 400 });
  }

  const result = await parseAvailability(parsed.data.text);

  if (!result.ok) {
    // Every failure here is recoverable, because the grid is always on screen.
    // The status codes distinguish "off" from "you" so the UI can say which.
    const messages = {
      disabled:
        "The natural-language box is off in this deployment. Set the hours in the grid instead.",
      too_long: `Keep it under ${MAX_INPUT_CHARS} characters — a sentence is plenty.`,
      empty: "Type when you are free, or set the hours in the grid.",
      unparseable:
        "That could not be read as availability. Try something like: weekday evenings after 6, Saturday mornings.",
    } as const;

    return NextResponse.json(
      { error: messages[result.reason] },
      { status: result.reason === "disabled" ? 503 : 422 },
    );
  }

  return NextResponse.json({
    rules: result.value.rules,
    interpretation: result.value.interpretation,
    // Rendered next to the grid so the buyer can check the reading at a
    // glance. A parse the buyer cannot see is a parse they cannot correct.
    summary: describeRules(result.value.rules),
  });
}
