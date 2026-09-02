/**
 * Wall clock -> instants.
 *
 * This module is the *only* place in the codebase that knows what a timezone
 * is. It takes weekly recurring rules expressed in local wall-clock time and
 * expands them into concrete UTC intervals over a date range. Every other part
 * of the engine works on instants and stays timezone-blind.
 *
 * Getting this wrong is the classic scheduling bug: expand one week, then add
 * `7 * 24 * 60 * 60 * 1000` for the next. That silently shifts every listing by
 * an hour twice a year. A window is anchored to the *civil calendar*, so the
 * expansion walks civil dates and re-resolves the offset on each one.
 */

import { TZDate } from "@date-fns/tz";
import type { DayOfWeek, Interval, RecurringRule } from "./types";
import { MINUTES_PER_DAY } from "./types";

/** A date on the civil calendar. No timezone, no offset — just Y/M/D. */
export interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

const civilFormatters = new Map<string, Intl.DateTimeFormat>();

function civilFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = civilFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    civilFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Which calendar date is it in `timeZone` at this instant? */
export function civilDateInZone(instant: number, timeZone: string): CivilDate {
  const parts = civilFormatter(timeZone).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function formatCivilDate({ year, month, day }: CivilDate): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(
    day,
  ).padStart(2, "0")}`;
}

export function parseCivilDate(iso: string): CivilDate {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

/** Civil-date arithmetic, done in UTC where no offset can interfere. */
export function addCivilDays(date: CivilDate, days: number): CivilDate {
  const ms = Date.UTC(date.year, date.month - 1, date.day) + days * 86_400_000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * A civil date's weekday is the same everywhere — it is a property of the
 * calendar, not of any clock — so this is computed in UTC on purpose.
 */
export function dayOfWeekOf(date: CivilDate): DayOfWeek {
  return new Date(
    Date.UTC(date.year, date.month - 1, date.day),
  ).getUTCDay() as DayOfWeek;
}

export function civilDatesBetween(from: CivilDate, to: CivilDate): CivilDate[] {
  const dates: CivilDate[] = [];
  const end = Date.UTC(to.year, to.month - 1, to.day);
  let cursor = from;
  // Bounded so a bad range can never hang a request: two years of days.
  for (let i = 0; i < 800; i += 1) {
    if (Date.UTC(cursor.year, cursor.month - 1, cursor.day) > end) break;
    dates.push(cursor);
    cursor = addCivilDays(cursor, 1);
  }
  return dates;
}

/**
 * Resolve a local wall-clock moment to an instant.
 *
 * `minuteOfDay` may be 1440 (or more), meaning midnight at the end of the day;
 * the civil date rolls forward rather than the hour being clamped, because
 * "open until midnight" is a real window a seller will type.
 *
 * Two DST edge cases, both handled by resolving against the zone rather than
 * an assumed offset:
 *
 *   - **Spring forward.** 02:30 on a day that skips 02:00-03:00 does not exist.
 *     It normalizes forward to 03:30 local. A 01:00-04:00 window that day is
 *     two real hours, not three, and the engine offers slots accordingly.
 *   - **Fall back.** 01:30 happens twice. Both boundaries resolve to the
 *     *second* occurrence, on the post-transition offset. An ambiguous local
 *     time has no correct answer, so what matters is that the choice is
 *     consistent: because start and end resolve the same way, the repeated
 *     hour is skipped rather than duplicated. A 01:00-04:00 window that day is
 *     three real hours, and no two showings can both be labelled "01:30".
 *     Offering the repeated hour twice would be worse than losing it — a buyer
 *     and a seller would read the same label and arrive an hour apart.
 */
export function zonedInstant(
  date: CivilDate,
  minuteOfDay: number,
  timeZone: string,
): number {
  const dayOffset = Math.floor(minuteOfDay / MINUTES_PER_DAY);
  const withinDay = minuteOfDay - dayOffset * MINUTES_PER_DAY;
  const target = dayOffset === 0 ? date : addCivilDays(date, dayOffset);
  return new TZDate(
    target.year,
    target.month - 1,
    target.day,
    Math.floor(withinDay / 60),
    withinDay % 60,
    0,
    0,
    timeZone,
  ).getTime();
}

export interface ExpandOptions {
  rules: RecurringRule[];
  timeZone: string;
  /** Range to expand over, as instants. Results are clipped to it. */
  from: number;
  to: number;
  /** Civil dates ("YYYY-MM-DD", in `timeZone`) to skip entirely. */
  blackoutDates?: string[];
}

/**
 * Expand weekly rules into UTC intervals, clipped to `[from, to)`.
 *
 * Results are normalized: sorted, merged, and free of empty intervals. A
 * window that DST collapses to zero length is dropped rather than emitted
 * backwards.
 */
export function expandRecurring({
  rules,
  timeZone,
  from,
  to,
  blackoutDates = [],
}: ExpandOptions): Interval[] {
  if (rules.length === 0 || to <= from) return [];

  const blackout = new Set(blackoutDates);
  const rulesByDay = new Map<DayOfWeek, RecurringRule[]>();
  for (const rule of rules) {
    const bucket = rulesByDay.get(rule.dayOfWeek);
    if (bucket) bucket.push(rule);
    else rulesByDay.set(rule.dayOfWeek, [rule]);
  }

  // Start a day early: a window can begin on the previous civil date in this
  // zone and still overlap the range (the range boundary is an instant, not a
  // local midnight).
  const first = addCivilDays(civilDateInZone(from, timeZone), -1);
  const last = addCivilDays(civilDateInZone(to, timeZone), 1);

  const intervals: Interval[] = [];
  for (const date of civilDatesBetween(first, last)) {
    if (blackout.has(formatCivilDate(date))) continue;
    const dayRules = rulesByDay.get(dayOfWeekOf(date));
    if (!dayRules) continue;

    for (const rule of dayRules) {
      const start = Math.max(zonedInstant(date, rule.startMinute, timeZone), from);
      const end = Math.min(zonedInstant(date, rule.endMinute, timeZone), to);
      if (end > start) intervals.push({ start, end });
    }
  }

  return normalizeIntervals(intervals);
}

/** Sort, drop empties, and merge anything overlapping or touching. */
export function normalizeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}
