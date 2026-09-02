import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const patchSchema = z.object({
  status: z.enum(["confirmed", "canceled"]),
});

/**
 * Cancel (or re-confirm) a showing.
 *
 * No ownership check appears in this handler, and that is deliberate rather
 * than forgotten: RLS already restricts UPDATE on `showings` to the buyer who
 * booked it and the seller who owns the listing. A hand-written check here
 * would be a second, drifting copy of that rule. What the handler must do is
 * notice when zero rows came back — that is what "not yours" looks like from
 * this side — and not report success for a write that never happened.
 *
 * Cancelling is a status change, not a delete. The row stays, so the history
 * of who booked what survives, and the EXCLUDE constraint stops applying to it
 * so the slot genuinely frees up.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("showings")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    // Re-confirming a cancelled showing can collide with whoever took the slot
    // in the meantime. Same constraint, same honest answer.
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "That time has been taken since it was cancelled." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not update the showing." }, { status: 500 });
  }

  if (!data) {
    // RLS filtered the row out. Not found and not yours are the same answer on
    // purpose: distinguishing them tells a stranger which showing ids exist.
    return NextResponse.json({ error: "Showing not found." }, { status: 404 });
  }

  return NextResponse.json({ showing: data });
}
