/**
 * Domain types for the scheduling engine.
 *
 * Two coordinate systems meet in this file, and keeping them apart is the
 * whole game:
 *
 *   - **Wall clock.** A seller says "Saturdays, 10:00 to 14:00". That is a
 *     day-of-week plus a time-of-day in the *listing's* timezone. It has no
 *     fixed UTC offset: 10:00 in New York is 14:00 UTC in January and 15:00
 *     UTC in July. `RecurringRule` models this.
 *
 *   - **Instants.** An actual booking happens at a point on the timeline that
 *     every participant agrees on. `Interval` and `Slot` model this, as epoch
 *     milliseconds and ISO strings respectively.
 *
 * The engine converts wall clock to instants exactly once, at expansion time
 * (see `windows.ts`). Everything downstream — intersection, buffers, conflict
 * detection — is pure arithmetic on instants, which is why it needs no
 * timezone knowledge at all.
 */

import { z } from "zod";

/** 0 = Sunday, matching `Date.prototype.getDay()`. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const MINUTES_PER_DAY = 24 * 60;

/**
 * A weekly repeating block of wall-clock time.
 *
 * Used for both sides of the marketplace: a seller's showing windows and a
 * buyer's availability are the same shape, interpreted in different timezones.
 * `startMinute` / `endMinute` are minutes from local midnight, so 10:00 is 600.
 */
export const recurringRuleSchema = z
  .object({
    dayOfWeek: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    startMinute: z.number().int().min(0).max(MINUTES_PER_DAY),
    endMinute: z.number().int().min(0).max(MINUTES_PER_DAY),
  })
  .refine((r) => r.endMinute > r.startMinute, {
    message: "endMinute must be after startMinute — rules never wrap past midnight",
  });

export type RecurringRule = z.infer<typeof recurringRuleSchema>;

/**
 * A half-open range of instants, `[start, end)`, in epoch milliseconds.
 *
 * Half-open is deliberate: a showing ending at 11:00 and one starting at 11:00
 * do not overlap. Postgres agrees — `tstzrange` is half-open by default — so
 * the in-memory engine and the database constraint cannot disagree about what
 * "adjacent" means.
 */
export interface Interval {
  start: number;
  end: number;
}

/** A bookable showing slot, serialized for the wire. */
export interface Slot {
  startsAt: string;
  endsAt: string;
}

/** Scheduling parameters a seller controls per listing. */
export interface ListingScheduleConfig {
  /** IANA zone of the property itself, e.g. "America/Denver". */
  timezone: string;
  /** Length of one showing. */
  slotMinutes: number;
  /** Dead time reserved around each booked showing, for travel and turnover. */
  bufferMinutes: number;
  /** How far ahead buyers may book. */
  bookingWindowDays: number;
  /** Minimum notice — a slot starting sooner than this is not offered. */
  minNoticeMinutes: number;
}

export const DEFAULT_SCHEDULE_CONFIG: ListingScheduleConfig = {
  timezone: "America/New_York",
  slotMinutes: 30,
  bufferMinutes: 15,
  bookingWindowDays: 14,
  minNoticeMinutes: 120,
};
