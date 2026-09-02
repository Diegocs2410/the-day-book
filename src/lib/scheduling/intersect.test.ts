import { describe, expect, it } from "vitest";
import {
  findOpenSlots,
  intersectIntervals,
  padIntervals,
  sliceIntoSlots,
  subtractIntervals,
  totalMinutes,
} from "./intersect";
import type { Interval, ListingScheduleConfig } from "./types";

const HOUR = 3_600_000;
const BASE = Date.UTC(2026, 5, 6); // a Saturday, used as hour zero

/** Interval from `a` to `b`, in hours past BASE. Keeps the tests readable. */
function h(a: number, b: number): Interval {
  return { start: BASE + a * HOUR, end: BASE + b * HOUR };
}

/** Renders intervals as "start-end" hour pairs for compact assertions. */
function hours(intervals: Interval[]): string[] {
  return intervals.map(
    (i) => `${(i.start - BASE) / HOUR}-${(i.end - BASE) / HOUR}`,
  );
}

describe("intersectIntervals", () => {
  it("keeps only the overlap", () => {
    expect(hours(intersectIntervals([h(9, 14)], [h(12, 18)]))).toEqual(["12-14"]);
  });

  it("returns nothing for disjoint sets", () => {
    expect(intersectIntervals([h(9, 11)], [h(12, 14)])).toEqual([]);
  });

  it("treats touching intervals as non-overlapping", () => {
    // Half-open ranges: a showing ending at 11:00 does not collide with one
    // starting at 11:00. Postgres `tstzrange` agrees, which is what keeps the
    // engine and the database constraint from disagreeing.
    expect(intersectIntervals([h(9, 11)], [h(11, 13)])).toEqual([]);
  });

  it("matches one interval against many", () => {
    expect(
      hours(intersectIntervals([h(9, 18)], [h(10, 11), h(13, 14), h(19, 20)])),
    ).toEqual(["10-11", "13-14"]);
  });

  it("handles many-to-many without losing a match", () => {
    expect(
      hours(intersectIntervals([h(0, 5), h(8, 12)], [h(4, 9), h(11, 20)])),
    ).toEqual(["4-5", "8-9", "11-12"]);
  });

  it("normalizes unsorted, overlapping input first", () => {
    expect(hours(intersectIntervals([h(13, 15), h(9, 14)], [h(10, 20)]))).toEqual([
      "10-15",
    ]);
  });

  it("is empty when either side is empty", () => {
    expect(intersectIntervals([], [h(9, 14)])).toEqual([]);
    expect(intersectIntervals([h(9, 14)], [])).toEqual([]);
  });
});

describe("subtractIntervals", () => {
  it("splits an interval when a hole falls inside it", () => {
    expect(hours(subtractIntervals([h(9, 17)], [h(12, 13)]))).toEqual([
      "9-12",
      "13-17",
    ]);
  });

  it("trims from either edge", () => {
    expect(hours(subtractIntervals([h(9, 17)], [h(8, 10)]))).toEqual(["10-17"]);
    expect(hours(subtractIntervals([h(9, 17)], [h(16, 20)]))).toEqual(["9-16"]);
  });

  it("removes an interval swallowed whole", () => {
    expect(subtractIntervals([h(9, 17)], [h(8, 18)])).toEqual([]);
  });

  it("applies several holes in one pass", () => {
    expect(hours(subtractIntervals([h(9, 17)], [h(10, 11), h(13, 14)]))).toEqual([
      "9-10",
      "11-13",
      "14-17",
    ]);
  });

  it("leaves the base untouched when holes miss it", () => {
    expect(hours(subtractIntervals([h(9, 12)], [h(14, 16)]))).toEqual(["9-12"]);
  });
});

describe("padIntervals", () => {
  it("grows intervals on both sides", () => {
    expect(hours(padIntervals([h(12, 13)], HOUR))).toEqual(["11-14"]);
  });

  it("merges neighbours the padding pushes together", () => {
    expect(hours(padIntervals([h(10, 11), h(12, 13)], HOUR / 2))).toEqual(["9.5-13.5"]);
  });

  it("is a no-op for zero padding", () => {
    expect(hours(padIntervals([h(10, 11)], 0))).toEqual(["10-11"]);
  });
});

describe("sliceIntoSlots", () => {
  it("cuts fixed-length slots from the start of each block", () => {
    expect(hours(sliceIntoSlots([h(10, 12)], 30))).toEqual([
      "10-10.5",
      "10.5-11",
      "11-11.5",
      "11.5-12",
    ]);
  });

  it("discards a remainder too short for a full showing", () => {
    // 45 minutes yields one 30-minute slot, not one and a half.
    expect(hours(sliceIntoSlots([h(10, 10.75)], 30))).toEqual(["10-10.5"]);
  });

  it("never lets a slot straddle a gap between blocks", () => {
    expect(hours(sliceIntoSlots([h(10, 10.5), h(11, 11.5)], 30))).toEqual([
      "10-10.5",
      "11-11.5",
    ]);
  });

  it("returns nothing when no block fits a whole slot", () => {
    expect(sliceIntoSlots([h(10, 10.25)], 30)).toEqual([]);
  });
});

describe("findOpenSlots", () => {
  const config: ListingScheduleConfig = {
    timezone: "UTC",
    slotMinutes: 30,
    bufferMinutes: 15,
    bookingWindowDays: 14,
    minNoticeMinutes: 120,
  };
  const now = BASE - 24 * HOUR; // the day before, so the horizon is wide open

  it("returns slots inside the buyer's availability only", () => {
    expect(
      hours(
        findOpenSlots({
          config,
          openIntervals: [h(9, 12)],
          buyerIntervals: [h(10, 11)],
          bookedIntervals: [],
          now,
        }),
      ),
    ).toEqual(["10-10.5", "10.5-11"]);
  });

  it("offers the full window when the buyer sets no availability", () => {
    expect(
      findOpenSlots({
        config,
        openIntervals: [h(9, 12)],
        buyerIntervals: [],
        bookedIntervals: [],
        now,
      }),
    ).toHaveLength(6);
  });

  it("lets a buffer eat the slots either side of a booking", () => {
    // 10:00-10:30 booked, 15 minute buffer -> 09:45-10:45 unavailable. The
    // 09:30 and 10:30 slots both go, because a slot must fit entirely in free
    // time. Slicing before subtracting would have offered them and the
    // database would then have rejected the booking.
    expect(
      hours(
        findOpenSlots({
          config,
          openIntervals: [h(9, 12)],
          bookedIntervals: [h(10, 10.5)],
          now,
        }),
      ),
    ).toEqual(["9-9.5", "11-11.5", "11.5-12"]);
  });

  it("hides slots that start inside the minimum-notice window", () => {
    // 08:00 plus two hours' notice: nothing before 10:00 is offered, so the
    // 09:00 and 09:30 slots disappear while the grid itself stays put.
    expect(
      hours(
        findOpenSlots({
          config,
          openIntervals: [h(9, 11)],
          bookedIntervals: [],
          now: BASE + 8 * HOUR,
        }),
      ),
    ).toEqual(["10-10.5", "10.5-11"]);
  });

  it("keeps slot times on the window's grid no matter what is booked", () => {
    // The regression this locks down: anchoring slots to surviving free time
    // instead of to the window would turn these into 10:45 and 11:15.
    const slots = findOpenSlots({
      config,
      openIntervals: [h(9, 12)],
      bookedIntervals: [h(10, 10.5)],
      now,
    });
    expect(slots.every((s) => (s.start - BASE) % (30 * 60_000) === 0)).toBe(true);
  });

  it("hides slots beyond the booking window", () => {
    const slots = findOpenSlots({
      config: { ...config, bookingWindowDays: 1 },
      openIntervals: [h(9, 11), h(48, 50)],
      bookedIntervals: [],
      now,
    });
    expect(hours(slots).every((s) => Number(s.split("-")[0]) < 24)).toBe(true);
  });

  it("returns nothing when the buyer and seller never overlap", () => {
    expect(
      findOpenSlots({
        config,
        openIntervals: [h(9, 12)],
        buyerIntervals: [h(18, 20)],
        bookedIntervals: [],
        now,
      }),
    ).toEqual([]);
  });
});

describe("totalMinutes", () => {
  it("sums merged coverage rather than raw input", () => {
    expect(totalMinutes([h(9, 11), h(10, 12)])).toBe(180);
  });
});
