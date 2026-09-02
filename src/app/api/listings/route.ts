import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { SCHEDULE_PARAM_RULES, validateScheduleParams } from "@/lib/scheduling";

const windowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1440),
    endMinute: z.number().int().min(0).max(1440),
  })
  .refine((w) => w.endMinute > w.startMinute, {
    message: "A window has to end after it starts.",
  });

const listingSchema = z.object({
  address: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(2),
  // Validated against the runtime's own zone database rather than a hardcoded
  // list, so the app cannot fall behind a zone rename.
  timezone: z.string().refine(isValidTimeZone, { message: "Unknown timezone." }),
  priceCents: z.number().int().min(0),
  bedrooms: z.number().int().min(0).max(20),
  bathrooms: z.number().min(0).max(20),
  squareFeet: z.number().int().positive(),
  description: z.string().max(2000).default(""),
  photoUrl: z.string().url().nullable().default(null),
  slotMinutes: z
    .number()
    .int()
    .min(SCHEDULE_PARAM_RULES.slotMinutes.min)
    .max(SCHEDULE_PARAM_RULES.slotMinutes.max),
  bufferMinutes: z
    .number()
    .int()
    .min(SCHEDULE_PARAM_RULES.bufferMinutes.min)
    .max(SCHEDULE_PARAM_RULES.bufferMinutes.max),
  bookingWindowDays: z
    .number()
    .int()
    .min(SCHEDULE_PARAM_RULES.bookingWindowDays.min)
    .max(SCHEDULE_PARAM_RULES.bookingWindowDays.max),
  minNoticeMinutes: z
    .number()
    .int()
    .min(SCHEDULE_PARAM_RULES.minNoticeMinutes.min)
    .max(SCHEDULE_PARAM_RULES.minNoticeMinutes.max),
  windows: z.array(windowSchema).min(1).max(50),
  blackoutDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(60).default([]),
});

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a listing with its showing windows.
 *
 * `seller_id` is taken from the verified session, never from the request body.
 * RLS would reject a mismatched one anyway, but not sending it at all means
 * there is no field for a caller to try.
 *
 * A listing and its windows are written as two statements, which leaves a
 * theoretical gap: a listing could exist with no windows if the second write
 * fails. That is survivable — an unpublished-looking listing with no openings
 * shows up to nobody and the seller can add windows — where a partial *booking*
 * would not be. Doing it properly wants a single RPC in a transaction, and
 * that is a deliberate trade for a one-day build, not an oversight.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to publish a listing." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = listingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some fields need another look.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;

  // The same bounds the database will enforce, checked here so the message is
  // readable. If these ever disagree, `rules.test.ts` fails.
  const scheduleErrors = validateScheduleParams({
    slotMinutes: input.slotMinutes,
    bufferMinutes: input.bufferMinutes,
    bookingWindowDays: input.bookingWindowDays,
    minNoticeMinutes: input.minNoticeMinutes,
  });
  if (Object.keys(scheduleErrors).length > 0) {
    return NextResponse.json({ error: "Check the showing settings.", scheduleErrors }, {
      status: 400,
    });
  }

  const supabase = await createClient();

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      seller_id: user.id,
      address: input.address,
      city: input.city,
      state: input.state.toUpperCase(),
      timezone: input.timezone,
      price_cents: input.priceCents,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      square_feet: input.squareFeet,
      description: input.description,
      photo_url: input.photoUrl,
      slot_minutes: input.slotMinutes,
      buffer_minutes: input.bufferMinutes,
      booking_window_days: input.bookingWindowDays,
      min_notice_minutes: input.minNoticeMinutes,
    })
    .select()
    .single();

  if (error || !listing) {
    return NextResponse.json({ error: "Could not save the listing." }, { status: 500 });
  }

  const { error: windowError } = await supabase.from("showing_windows").insert(
    input.windows.map((w) => ({
      listing_id: listing.id,
      day_of_week: w.dayOfWeek,
      start_minute: w.startMinute,
      end_minute: w.endMinute,
    })),
  );

  if (windowError) {
    return NextResponse.json(
      { error: "The listing saved but its showing times did not. Add them below." },
      { status: 500 },
    );
  }

  if (input.blackoutDates.length > 0) {
    await supabase.from("blackout_dates").insert(
      input.blackoutDates.map((date) => ({
        listing_id: listing.id,
        blackout_date: date,
      })),
    );
  }

  return NextResponse.json({ listing }, { status: 201 });
}
