/**
 * Golden master for the scheduling engine.
 *
 * This freezes the behaviour of the whole pipeline on one realistic scenario.
 * If it fails, the question is not "how do I update the expected array?" — it
 * is "which seller's calendar just changed under them?". New cases belong in
 * the unit tests next door; this file exists to make silent drift loud.
 *
 * The scenario is picked to exercise everything at once: a listing in Denver,
 * a buyer in New York (two zones, two hours apart), a range that crosses the
 * spring-forward transition, a blackout date, an existing booking with a
 * buffer, and a buyer whose availability only partly overlaps the windows.
 */

import { describe, expect, it } from "vitest";
import { matchListing } from "./match";
import type { ListingScheduleConfig, RecurringRule } from "./types";

const DENVER = "America/Denver";
const NEW_YORK = "America/New_York";

const config: ListingScheduleConfig = {
  timezone: DENVER,
  slotMinutes: 45,
  bufferMinutes: 15,
  bookingWindowDays: 21,
  minNoticeMinutes: 180,
};

// Seller: Saturdays 10:00-13:00 and Wednesdays 17:00-19:00, Denver wall clock.
const windows: RecurringRule[] = [
  { dayOfWeek: 6, startMinute: 10 * 60, endMinute: 13 * 60 },
  { dayOfWeek: 3, startMinute: 17 * 60, endMinute: 19 * 60 },
];

// Buyer: weekday evenings from 19:00, and Saturdays until 14:00 — New York clock.
const buyerAvailability: RecurringRule[] = [
  { dayOfWeek: 3, startMinute: 19 * 60, endMinute: 22 * 60 },
  { dayOfWeek: 6, startMinute: 8 * 60, endMinute: 14 * 60 },
];

const now = Date.UTC(2026, 1, 25, 15, 0); // Wed 2026-02-25, 08:00 Denver

/** Renders slots in both zones — the assertion should be readable by a human. */
function readable(startsAt: string): string {
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(startsAt));
  return `${format(DENVER)} MT / ${format(NEW_YORK)} ET`;
}

describe("scheduling engine golden master", () => {
  const result = matchListing({
    config,
    windows,
    blackoutDates: ["2026-03-07"], // the seller is away that Saturday
    buyerAvailability,
    buyerTimeZone: NEW_YORK,
    bookedIntervals: [
      // Sat 2026-02-28, 10:00-10:45 Denver is already taken.
      { start: Date.UTC(2026, 1, 28, 17, 0), end: Date.UTC(2026, 1, 28, 17, 45) },
    ],
    now,
  });

  it("offers exactly these slots", () => {
    expect(result.slots.map((s) => readable(s.startsAt))).toEqual([
      // Wednesdays: seller open 17:00-19:00 MT = 19:00-21:00 ET, buyer free
      // 19:00-22:00 ET. Both 45-minute slots fit, every week.
      "Wed 25 Feb, 17:00 MT / Wed 25 Feb, 19:00 ET",
      "Wed 25 Feb, 17:45 MT / Wed 25 Feb, 19:45 ET",
      // Sat 28 Feb yields nothing, and it takes all three filters to explain
      // why: 10:00 is booked, its 15-minute buffer swallows 10:45, and the
      // buyer's 14:00 ET cutoff is 12:00 MT — so the 11:30-12:15 slot runs
      // past the end of their availability and cannot be offered whole.
      "Wed 04 Mar, 17:00 MT / Wed 04 Mar, 19:00 ET",
      "Wed 04 Mar, 17:45 MT / Wed 04 Mar, 19:45 ET",
      // Sat 07 Mar is blacked out entirely.
      // Sun 08 Mar the clocks go forward in both zones.
      "Wed 11 Mar, 17:00 MT / Wed 11 Mar, 19:00 ET",
      "Wed 11 Mar, 17:45 MT / Wed 11 Mar, 19:45 ET",
      // Sat 14 Mar is free, so the first two slots survive; 11:30 is still cut
      // by the buyer's noon-Denver cutoff.
      "Sat 14 Mar, 10:00 MT / Sat 14 Mar, 12:00 ET",
      "Sat 14 Mar, 10:45 MT / Sat 14 Mar, 12:45 ET",
    ]);
  });

  it("keeps the same wall-clock offer on both sides of the DST transition", () => {
    // 04 Mar is MST, 11 Mar is MDT. Denver reads 17:00 on both, and so does
    // New York at 19:00, because the two zones shift together.
    const evenings = result.slots
      .map((s) => readable(s.startsAt))
      .filter((s) => s.includes("17:00 MT"));
    expect(evenings).toEqual([
      "Wed 25 Feb, 17:00 MT / Wed 25 Feb, 19:00 ET",
      "Wed 04 Mar, 17:00 MT / Wed 04 Mar, 19:00 ET",
      "Wed 11 Mar, 17:00 MT / Wed 11 Mar, 19:00 ET",
    ]);

    // And the instants prove the offset really moved: seven days of wall clock
    // across the transition is 167 real hours, not 168.
    const [, beforeDst, afterDst] = result.slots
      .filter((s) => readable(s.startsAt).includes("17:00 MT"))
      .map((s) => Date.parse(s.startsAt));
    expect((afterDst - beforeDst) / 3_600_000).toBe(7 * 24 - 1);
  });

  it("reports how much of the listing's open time the buyer can actually use", () => {
    // Two Saturdays (07 Mar blacked out) x 180 + three Wednesdays x 120.
    expect(result.openMinutes).toBe(720);
    expect(result.matchedMinutes).toBe(360); // 8 slots x 45 minutes
  });

  it("drops every slot when the buyer is only free while the listing is shut", () => {
    const noOverlap = matchListing({
      config,
      windows,
      buyerAvailability: [{ dayOfWeek: 1, startMinute: 0, endMinute: 6 * 60 }],
      buyerTimeZone: NEW_YORK,
      now,
    });
    expect(noOverlap.slots).toEqual([]);
    expect(noOverlap.openMinutes).toBe(900); // 720 plus the un-blacked-out Saturday
  });
});
