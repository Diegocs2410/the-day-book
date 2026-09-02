/**
 * The composition layer: rules in, bookable slots out.
 *
 * This is the single entry point the API routes and the UI call. It is still a
 * pure function — no database, no `Date.now()` — which is what lets the golden
 * master pin the entire pipeline end to end without a server running.
 */

import { findOpenSlots, totalMinutes } from "./intersect";
import type { Interval, ListingScheduleConfig, RecurringRule, Slot } from "./types";
import { expandRecurring } from "./windows";
import { toSlot } from "./intersect";

export interface MatchInput {
  config: ListingScheduleConfig;
  /** Seller's showing windows, in wall-clock time in the listing's zone. */
  windows: RecurringRule[];
  /** Civil dates ("YYYY-MM-DD") the seller has blacked out. */
  blackoutDates?: string[];
  /** Buyer's availability, in wall-clock time in the *buyer's* zone. */
  buyerAvailability?: RecurringRule[];
  /** The buyer's zone. Ignored when they gave no availability. */
  buyerTimeZone?: string;
  /** Showings already booked on this listing, as instants. */
  bookedIntervals?: Interval[];
  now: number;
}

export interface MatchResult {
  slots: Slot[];
  /** Minutes the listing is open at all in the horizon, before any filtering. */
  openMinutes: number;
  /** Minutes where seller and buyer overlap. Drives the "why this listing" copy. */
  matchedMinutes: number;
}

/**
 * Match one listing against one buyer.
 *
 * Note the two expansions use *different* timezones on purpose. A seller in
 * Denver offering "Saturday 10:00" and a buyer in New York free "Saturday
 * mornings" are describing different instants, and the overlap between them is
 * the actual answer — a buyer in New York genuinely cannot make a 10:00
 * Denver showing before 12:00 their time. Expanding both sides in one zone is
 * the bug that makes a cross-country buyer see slots they cannot attend.
 */
export function matchListing({
  config,
  windows,
  blackoutDates = [],
  buyerAvailability = [],
  buyerTimeZone,
  bookedIntervals = [],
  now,
}: MatchInput): MatchResult {
  const from = now;
  const to = now + config.bookingWindowDays * 86_400_000;

  const openIntervals = expandRecurring({
    rules: windows,
    timeZone: config.timezone,
    from,
    to,
    blackoutDates,
  });

  const buyerIntervals =
    buyerAvailability.length > 0
      ? expandRecurring({
          rules: buyerAvailability,
          timeZone: buyerTimeZone ?? config.timezone,
          from,
          to,
        })
      : [];

  const slots = findOpenSlots({
    config,
    openIntervals,
    buyerIntervals,
    bookedIntervals,
    now,
  });

  return {
    slots: slots.map(toSlot),
    openMinutes: totalMinutes(openIntervals),
    matchedMinutes: totalMinutes(slots),
  };
}
