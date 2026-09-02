import { createClient } from "@/lib/supabase/server";
import {
  matchListing,
  type Interval,
  type ListingScheduleConfig,
  type RecurringRule,
  type Slot,
} from "@/lib/scheduling";
import type { ListingRow, ListingWithSchedule } from "@/lib/types";

/** Pull the engine's config out of a listing row. */
export function toScheduleConfig(listing: ListingRow): ListingScheduleConfig {
  return {
    timezone: listing.timezone,
    slotMinutes: listing.slot_minutes,
    bufferMinutes: listing.buffer_minutes,
    bookingWindowDays: listing.booking_window_days,
    minNoticeMinutes: listing.min_notice_minutes,
  };
}

export function toRecurringRules(
  windows: { day_of_week: number; start_minute: number; end_minute: number }[],
): RecurringRule[] {
  return windows.map((w) => ({
    dayOfWeek: w.day_of_week as RecurringRule["dayOfWeek"],
    startMinute: w.start_minute,
    endMinute: w.end_minute,
  }));
}

export interface ListingMatch {
  listing: ListingWithSchedule;
  slots: Slot[];
  openMinutes: number;
  matchedMinutes: number;
}

export interface SearchInput {
  availability: RecurringRule[];
  buyerTimeZone: string;
  /**
   * Injected by tests so results are reproducible. Left out in the app, where
   * it defaults to the wall clock.
   *
   * The read happens here rather than in the page because reading a clock
   * during render is impure — React's lint says so, and it is right: a render
   * that reruns would quietly search a different moment. The engine itself
   * still takes `now` as a required argument and never reads a clock at all.
   */
  now?: number;
  /** Optional filters, all inclusive. */
  city?: string;
  maxPriceCents?: number;
  minBedrooms?: number;
}

const LISTING_SELECT = `
  *,
  showing_windows (*),
  blackout_dates (*)
` as const;

/**
 * Find listings a buyer can actually attend.
 *
 * The filtering that matters happens in the engine, not in SQL. "Which
 * listings have an opening inside my availability" is not a WHERE clause: it
 * needs each listing's windows expanded in that listing's own timezone, its
 * blackouts removed, its booked showings buffered, and the result intersected
 * with the buyer's availability expanded in the *buyer's* timezone. Postgres
 * narrows the candidate set on the cheap attributes — city, price, bedrooms —
 * and the engine decides the rest.
 *
 * Listings with no matching slot are dropped, which is the point of the
 * feature: a buyer should not scroll past homes they cannot get into.
 */
export async function searchListings({
  availability,
  buyerTimeZone,
  now = Date.now(),
  city,
  maxPriceCents,
  minBedrooms,
}: SearchInput): Promise<ListingMatch[]> {
  const supabase = await createClient();

  let query = supabase
    .from("listings")
    .select(LISTING_SELECT)
    .eq("is_published", true);

  if (city) query = query.ilike("city", city);
  if (maxPriceCents) query = query.lte("price_cents", maxPriceCents);
  if (minBedrooms) query = query.gte("bedrooms", minBedrooms);

  const { data: listings, error } = await query;
  if (error) throw error;
  if (!listings || listings.length === 0) return [];

  // One query for every candidate's booked showings, rather than one per
  // listing. The N+1 here would be invisible with six seeded listings and
  // very visible with six hundred.
  const horizonEnd = new Date(
    now + Math.max(...listings.map((l) => l.booking_window_days)) * 86_400_000,
  ).toISOString();

  const { data: booked, error: bookedError } = await supabase
    .from("showings")
    .select("listing_id, starts_at, ends_at")
    .in(
      "listing_id",
      listings.map((l) => l.id),
    )
    .neq("status", "canceled")
    .gte("ends_at", new Date(now).toISOString())
    .lte("starts_at", horizonEnd);

  if (bookedError) throw bookedError;

  const bookedByListing = new Map<string, Interval[]>();
  for (const showing of booked ?? []) {
    const intervals = bookedByListing.get(showing.listing_id) ?? [];
    intervals.push({
      start: Date.parse(showing.starts_at),
      end: Date.parse(showing.ends_at),
    });
    bookedByListing.set(showing.listing_id, intervals);
  }

  const matches: ListingMatch[] = [];
  for (const listing of listings as unknown as ListingWithSchedule[]) {
    const result = matchListing({
      config: toScheduleConfig(listing),
      windows: toRecurringRules(listing.showing_windows ?? []),
      blackoutDates: (listing.blackout_dates ?? []).map((b) => b.blackout_date),
      buyerAvailability: availability,
      buyerTimeZone,
      bookedIntervals: bookedByListing.get(listing.id) ?? [],
      now,
    });

    if (result.slots.length === 0) continue;
    matches.push({ listing, ...result });
  }

  // Most available first: a buyer with a tight schedule wants the listing they
  // have the most ways to reach, not the cheapest one they can barely make.
  return matches.sort((a, b) => b.matchedMinutes - a.matchedMinutes);
}

/** One listing with its schedule, for the detail and booking views. */
export async function getListingWithSchedule(
  id: string,
): Promise<ListingWithSchedule | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listings")
    .select(LISTING_SELECT)
    .eq("id", id)
    .single();

  return (data as unknown as ListingWithSchedule) ?? null;
}
