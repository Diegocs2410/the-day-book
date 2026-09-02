/**
 * Interval algebra and slot generation.
 *
 * Everything here operates on instants (epoch milliseconds) and knows nothing
 * about timezones, calendars, or the database. That is what makes the matching
 * logic exhaustively testable: given two arrays of numbers, the answer is a
 * third array of numbers, and there is exactly one right one.
 */

import type { Interval, ListingScheduleConfig, Slot } from "./types";
import { normalizeIntervals } from "./windows";

const MINUTE_MS = 60_000;

/**
 * Overlap of two interval sets.
 *
 * Two-pointer sweep over normalized inputs, O(n + m). This is the matching
 * rule of the whole product: a listing is only shown to a buyer when the
 * seller's open time and the buyer's availability actually overlap.
 */
export function intersectIntervals(a: Interval[], b: Interval[]): Interval[] {
  const left = normalizeIntervals(a);
  const right = normalizeIntervals(b);
  const result: Interval[] = [];

  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start);
    const end = Math.min(left[i].end, right[j].end);
    if (end > start) result.push({ start, end });

    // Advance whichever interval ends first; the other may still overlap the
    // next one along.
    if (left[i].end < right[j].end) i += 1;
    else j += 1;
  }
  return result;
}

/** `base` minus `cut`. Used to carve booked showings out of open time. */
export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  const holes = normalizeIntervals(cut);
  const result: Interval[] = [];

  for (const interval of normalizeIntervals(base)) {
    let cursor = interval.start;
    for (const hole of holes) {
      if (hole.end <= cursor) continue;
      if (hole.start >= interval.end) break;
      if (hole.start > cursor) result.push({ start: cursor, end: hole.start });
      cursor = Math.max(cursor, hole.end);
      if (cursor >= interval.end) break;
    }
    if (cursor < interval.end) result.push({ start: cursor, end: interval.end });
  }
  return result;
}

/** Grow every interval outward — how a buffer around a booking is applied. */
export function padIntervals(intervals: Interval[], padMs: number): Interval[] {
  if (padMs <= 0) return normalizeIntervals(intervals);
  return normalizeIntervals(
    intervals.map((i) => ({ start: i.start - padMs, end: i.end + padMs })),
  );
}

/**
 * Cut free time into bookable slots of fixed length.
 *
 * Slots are aligned to the start of each free block and never straddle a gap:
 * a 45-minute opening yields one 30-minute slot, not one and a half. The
 * remainder is discarded rather than offered as a short showing.
 */
export function sliceIntoSlots(
  intervals: Interval[],
  slotMinutes: number,
  options: { limitPerInterval?: number } = {},
): Interval[] {
  const slotMs = slotMinutes * MINUTE_MS;
  if (slotMs <= 0) return [];

  const slots: Interval[] = [];
  for (const interval of normalizeIntervals(intervals)) {
    let cursor = interval.start;
    let produced = 0;
    while (cursor + slotMs <= interval.end) {
      slots.push({ start: cursor, end: cursor + slotMs });
      cursor += slotMs;
      produced += 1;
      if (options.limitPerInterval && produced >= options.limitPerInterval) break;
    }
  }
  return slots;
}

export function toSlot(interval: Interval): Slot {
  return {
    startsAt: new Date(interval.start).toISOString(),
    endsAt: new Date(interval.end).toISOString(),
  };
}

/** Is this interval wholly contained in one of `allowed`? */
export function isContainedIn(interval: Interval, allowed: Interval[]): boolean {
  return normalizeIntervals(allowed).some(
    (a) => a.start <= interval.start && a.end >= interval.end,
  );
}

export interface OpenSlotsInput {
  config: ListingScheduleConfig;
  /** The listing's open time, already expanded to instants. */
  openIntervals: Interval[];
  /** The buyer's availability, already expanded to instants. Empty = no filter. */
  buyerIntervals?: Interval[];
  /** Showings already on the books for this listing. */
  bookedIntervals: Interval[];
  /** Injected rather than read from the clock, so results are reproducible. */
  now: number;
}

/**
 * The matching pipeline.
 *
 * Candidate slots are cut from the seller's *open window*, then filtered — not
 * cut from whatever free time survives. That ordering is the whole point, and
 * the tests pin it:
 *
 *   Slice-then-filter gives a listing a stable grid. A 09:00-12:00 window with
 *   30-minute showings always offers 09:00, 09:30, 10:00 ... whether or not
 *   10:00 is already taken. Filter-then-slice would re-anchor to the surviving
 *   fragment: book 10:00-10:30 with a 15-minute buffer and the next offer
 *   becomes 10:45, then 11:15 — times that are on no one's calendar, and that
 *   move again with the next booking. Sellers plan their day on a grid; the
 *   slots have to sit on it.
 *
 * Filters, all of which a slot must satisfy *entirely* (a slot that only
 * partly fits is not bookable):
 *
 *   1. inside the bookable horizon — past minimum notice, within the window
 *   2. clear of booked showings, each grown by the listing's buffer
 *   3. inside the buyer's availability, when they gave any
 *
 * Buffers are applied before the fit check rather than after, so the engine
 * never offers a slot the database's overlap constraint would then reject.
 */
export function findOpenSlots({
  config,
  openIntervals,
  buyerIntervals,
  bookedIntervals,
  now,
}: OpenSlotsInput): Interval[] {
  const horizon: Interval = {
    start: now + config.minNoticeMinutes * MINUTE_MS,
    end: now + config.bookingWindowDays * 86_400_000,
  };
  if (horizon.end <= horizon.start) return [];

  const candidates = sliceIntoSlots(openIntervals, config.slotMinutes);

  let allowed = subtractIntervals(
    intersectIntervals(openIntervals, [horizon]),
    padIntervals(bookedIntervals, config.bufferMinutes * MINUTE_MS),
  );
  if (buyerIntervals && buyerIntervals.length > 0) {
    allowed = intersectIntervals(allowed, buyerIntervals);
  }

  return candidates.filter((slot) => isContainedIn(slot, allowed));
}

/** Total minutes covered by a set of intervals. Used for the match summary. */
export function totalMinutes(intervals: Interval[]): number {
  return normalizeIntervals(intervals).reduce(
    (sum, i) => sum + (i.end - i.start) / MINUTE_MS,
    0,
  );
}
