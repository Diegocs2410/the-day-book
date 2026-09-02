import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getListingWithSchedule, toRecurringRules, toScheduleConfig } from "@/lib/search";
import { matchListing, type Interval, type RecurringRule } from "@/lib/scheduling";

const bookingSchema = z.object({
  listingId: z.string().uuid(),
  startsAt: z.string().datetime(),
  note: z.string().max(500).optional(),
  /** Sent so the server can reproduce the buyer's view; never trusted as truth. */
  availability: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(0).max(1440),
      }),
    )
    .max(30)
    .optional(),
});

/**
 * Book a showing.
 *
 * The interesting part is what this does *not* trust. A booking request
 * arrives with a listing id and a start time, and both come from a browser.
 * Two separate things therefore have to hold, and neither can be skipped:
 *
 *   1. **The slot has to be one the engine would offer.** Otherwise a buyer
 *      can POST 03:00 on a Tuesday and get a showing the seller never opened.
 *      The engine is re-run server-side and the requested start must appear in
 *      its output. The client's rendering of the slot list is a convenience,
 *      not an authority.
 *
 *   2. **The insert has to survive the race.** Even a slot that was genuinely
 *      free a millisecond ago may not be by the time this transaction commits.
 *      The EXCLUDE constraint decides that, and a 23P01 becomes a 409.
 *
 * Check (1) without (2) is a time-of-check-to-time-of-use bug; (2) without (1)
 * lets anyone book outside the seller's hours. Both, in this order.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to book a showing." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "That booking request was malformed." },
      { status: 400 },
    );
  }

  const { listingId, startsAt, note, availability } = parsed.data;

  const listing = await getListingWithSchedule(listingId);
  if (!listing || !listing.is_published) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const now = Date.now();

  // The same view the search uses, so the slots this route validates against
  // are computed from exactly the data the buyer was offered from.
  const { data: existing, error: existingError } = await supabase
    .from("listing_busy_times")
    .select("starts_at, ends_at")
    .eq("listing_id", listingId)
    .gte("ends_at", new Date(now).toISOString());

  if (existingError) {
    return NextResponse.json({ error: "Could not read the calendar." }, { status: 500 });
  }

  const bookedIntervals: Interval[] = (existing ?? []).map((s) => ({
    start: Date.parse(s.starts_at),
    end: Date.parse(s.ends_at),
  }));

  const { slots } = matchListing({
    config: toScheduleConfig(listing),
    windows: toRecurringRules(listing.showing_windows ?? []),
    blackoutDates: (listing.blackout_dates ?? []).map((b) => b.blackout_date),
    // Availability is deliberately left out of this check. It is the buyer's
    // own filter, not a rule about the property — a buyer who changes their
    // mind and books a slot outside what they typed is doing nothing wrong.
    buyerAvailability: [] as RecurringRule[],
    bookedIntervals,
    now,
  });

  const requested = Date.parse(startsAt);
  const slot = slots.find((s) => Date.parse(s.startsAt) === requested);
  if (!slot) {
    return NextResponse.json(
      { error: "That time is not available for this listing." },
      { status: 409 },
    );
  }

  const { data: showing, error } = await supabase
    .from("showings")
    .insert({
      listing_id: listingId,
      buyer_id: user.id,
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      status: "confirmed",
      buyer_note: note ?? "",
    })
    .select()
    .single();

  if (error) {
    // 23P01 is the EXCLUDE constraint: someone else committed first. This is
    // the expected outcome of a genuine race, not a server fault, so it gets a
    // 409 and a sentence the buyer can act on.
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "Someone just booked that time. Pick another slot." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Could not book that showing." }, { status: 500 });
  }

  // Echoed back so the client can re-filter its list without another round
  // trip; `availability` is used only for that, never for authorization.
  return NextResponse.json({ showing, availability: availability ?? [] }, { status: 201 });
}
