import { describe, expect, it } from "vitest";
import {
  addCivilDays,
  civilDateInZone,
  dayOfWeekOf,
  expandRecurring,
  formatCivilDate,
  normalizeIntervals,
  parseCivilDate,
  zonedInstant,
} from "./windows";
import type { RecurringRule } from "./types";

const NEW_YORK = "America/New_York";

/** Reads an instant back as wall-clock time in a zone, for assertions. */
function wallClock(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instant));
}

const saturdayMorning: RecurringRule = {
  dayOfWeek: 6,
  startMinute: 10 * 60,
  endMinute: 14 * 60,
};

describe("civil date helpers", () => {
  it("reads the calendar date as seen in the target zone, not the host zone", () => {
    // 03:00 UTC on Jan 2 is still Jan 1 in New York.
    const instant = Date.UTC(2026, 0, 2, 3, 0);
    expect(formatCivilDate(civilDateInZone(instant, NEW_YORK))).toBe("2026-01-01");
    expect(formatCivilDate(civilDateInZone(instant, "UTC"))).toBe("2026-01-02");
  });

  it("crosses month and year boundaries when adding days", () => {
    expect(formatCivilDate(addCivilDays(parseCivilDate("2026-02-28"), 1))).toBe(
      "2026-03-01",
    );
    expect(formatCivilDate(addCivilDays(parseCivilDate("2026-12-31"), 1))).toBe(
      "2027-01-01",
    );
    // 2028 is a leap year — Feb 29 exists.
    expect(formatCivilDate(addCivilDays(parseCivilDate("2028-02-28"), 1))).toBe(
      "2028-02-29",
    );
  });

  it("treats weekday as a property of the calendar", () => {
    expect(dayOfWeekOf(parseCivilDate("2026-03-07"))).toBe(6); // Saturday
    expect(dayOfWeekOf(parseCivilDate("2026-03-09"))).toBe(1); // Monday
  });
});

describe("zonedInstant", () => {
  it("rolls minute 1440 into midnight of the next day", () => {
    const midnight = zonedInstant(parseCivilDate("2026-06-10"), 1440, NEW_YORK);
    expect(wallClock(midnight, NEW_YORK)).toBe("11/06/2026, 00:00");
  });

  it("normalizes a local time that DST skipped", () => {
    // 2026-03-08: New York jumps 02:00 -> 03:00. 02:30 never happens.
    const skipped = zonedInstant(parseCivilDate("2026-03-08"), 2 * 60 + 30, NEW_YORK);
    expect(wallClock(skipped, NEW_YORK)).toBe("08/03/2026, 03:30");
  });
});

describe("expandRecurring", () => {
  it("holds wall-clock time steady across a DST transition", () => {
    // The bug this guards against: expanding one week and adding 7*24h for the
    // rest. That would drift these to 09:00 or 11:00 after the clocks change.
    const intervals = expandRecurring({
      rules: [saturdayMorning],
      timeZone: NEW_YORK,
      from: Date.UTC(2026, 1, 28),
      to: Date.UTC(2026, 2, 22),
      blackoutDates: [],
    });

    const starts = intervals.map((i) => wallClock(i.start, NEW_YORK));
    expect(starts).toEqual([
      "28/02/2026, 10:00", // EST
      "07/03/2026, 10:00", // EST, last Saturday before the change
      "14/03/2026, 10:00", // EDT, offset now differs
      "21/03/2026, 10:00", // EDT
    ]);

    // Same wall clock, different UTC offset — the proof the offset was
    // re-resolved rather than assumed.
    expect(new Date(intervals[1].start).toISOString()).toBe("2026-03-07T15:00:00.000Z");
    expect(new Date(intervals[2].start).toISOString()).toBe("2026-03-14T14:00:00.000Z");
  });

  it("yields two real hours for a 01:00-04:00 window on spring-forward day", () => {
    const [interval] = expandRecurring({
      rules: [{ dayOfWeek: 0, startMinute: 60, endMinute: 4 * 60 }],
      timeZone: NEW_YORK,
      from: Date.UTC(2026, 2, 8),
      to: Date.UTC(2026, 2, 9),
    });

    expect((interval.end - interval.start) / 3_600_000).toBe(2);
  });

  it("skips rather than duplicates the repeated hour on fall-back day", () => {
    // 2026-11-01: New York repeats 01:00-02:00. Both boundaries resolve to the
    // post-transition offset, so the window is three real hours and the
    // repeated hour is dropped. That is the safe direction to be wrong in:
    // offering it twice would put a buyer and a seller an hour apart while
    // both read "01:30" on their screens.
    const [interval] = expandRecurring({
      rules: [{ dayOfWeek: 0, startMinute: 60, endMinute: 4 * 60 }],
      timeZone: NEW_YORK,
      from: Date.UTC(2026, 10, 1),
      to: Date.UTC(2026, 10, 2),
    });

    expect((interval.end - interval.start) / 3_600_000).toBe(3);
    expect(new Date(interval.start).toISOString()).toBe("2026-11-01T06:00:00.000Z");
  });

  it("skips blackout dates by their civil date in the listing's zone", () => {
    const intervals = expandRecurring({
      rules: [saturdayMorning],
      timeZone: NEW_YORK,
      from: Date.UTC(2026, 5, 1),
      to: Date.UTC(2026, 5, 29),
      blackoutDates: ["2026-06-13"],
    });

    const dates = intervals.map((i) =>
      formatCivilDate(civilDateInZone(i.start, NEW_YORK)),
    );
    expect(dates).toEqual(["2026-06-06", "2026-06-20", "2026-06-27"]);
  });

  it("clips to the requested range instead of overhanging it", () => {
    const from = Date.UTC(2026, 5, 6, 16, 0); // 12:00 in New York, mid-window
    const [interval] = expandRecurring({
      rules: [saturdayMorning],
      timeZone: NEW_YORK,
      from,
      to: Date.UTC(2026, 5, 6, 17, 0),
    });

    expect(interval.start).toBe(from);
    expect(wallClock(interval.end, NEW_YORK)).toBe("06/06/2026, 13:00");
  });

  it("returns nothing for an empty rule set or an inverted range", () => {
    const range = { timeZone: NEW_YORK, from: Date.UTC(2026, 5, 1), to: Date.UTC(2026, 5, 8) };
    expect(expandRecurring({ ...range, rules: [] })).toEqual([]);
    expect(
      expandRecurring({ ...range, rules: [saturdayMorning], to: range.from - 1 }),
    ).toEqual([]);
  });

  it("merges rules that overlap on the same day", () => {
    const intervals = expandRecurring({
      rules: [
        { dayOfWeek: 6, startMinute: 9 * 60, endMinute: 12 * 60 },
        { dayOfWeek: 6, startMinute: 11 * 60, endMinute: 15 * 60 },
      ],
      timeZone: NEW_YORK,
      from: Date.UTC(2026, 5, 6),
      to: Date.UTC(2026, 5, 7),
    });

    expect(intervals).toHaveLength(1);
    expect(wallClock(intervals[0].start, NEW_YORK)).toBe("06/06/2026, 09:00");
    expect(wallClock(intervals[0].end, NEW_YORK)).toBe("06/06/2026, 15:00");
  });

  it("places the same wall-clock window at different instants per zone", () => {
    const range = { from: Date.UTC(2026, 5, 6), to: Date.UTC(2026, 5, 7) };
    const east = expandRecurring({ rules: [saturdayMorning], timeZone: NEW_YORK, ...range });
    const west = expandRecurring({
      rules: [saturdayMorning],
      timeZone: "America/Los_Angeles",
      ...range,
    });

    expect(west[0].start - east[0].start).toBe(3 * 3_600_000);
  });
});

describe("normalizeIntervals", () => {
  it("merges touching intervals and drops empty ones", () => {
    expect(
      normalizeIntervals([
        { start: 30, end: 40 },
        { start: 0, end: 10 },
        { start: 10, end: 20 },
        { start: 50, end: 50 },
      ]),
    ).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 40 },
    ]);
  });
});
