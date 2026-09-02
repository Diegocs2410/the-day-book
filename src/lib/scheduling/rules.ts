/**
 * Bounds on the scheduling parameters a seller controls.
 *
 * These deliberately duplicate the CHECK constraints in the baseline
 * migration. The duplication is not an accident and is not a cache: it exists
 * so the form can say "showings run between 15 minutes and 4 hours" before the
 * request is sent, instead of surfacing Postgres's
 * `new row violates check constraint "listings_slot_minutes_check"` to someone
 * trying to sell a house.
 *
 * Duplication that drifts is worse than no duplication, so `rules.test.ts`
 * parses the migration and fails if these bounds and the CHECKs disagree. The
 * database stays the authority; this file only gets to be polite first.
 */

export interface ScheduleParamRule {
  /** Column in `listings` this mirrors. */
  column: string;
  min: number;
  max: number;
  /** Shown in the form when the value is out of range. */
  message: string;
}

export const SCHEDULE_PARAM_RULES = {
  slotMinutes: {
    column: "slot_minutes",
    min: 15,
    max: 240,
    message: "A showing runs between 15 minutes and 4 hours.",
  },
  bufferMinutes: {
    column: "buffer_minutes",
    min: 0,
    max: 120,
    message: "Buffer between showings is at most 2 hours. Use 0 for none.",
  },
  bookingWindowDays: {
    column: "booking_window_days",
    min: 1,
    max: 90,
    message: "Buyers can book between 1 and 90 days ahead.",
  },
  minNoticeMinutes: {
    column: "min_notice_minutes",
    min: 0,
    max: 10080,
    message: "Minimum notice is at most 7 days. Use 0 to allow same-hour bookings.",
  },
} as const satisfies Record<string, ScheduleParamRule>;

export type ScheduleParamKey = keyof typeof SCHEDULE_PARAM_RULES;

/**
 * Validate scheduling parameters, returning a message per offending field.
 *
 * Returns `{}` when everything is in range, so a caller can branch on
 * `Object.keys(errors).length === 0` without a second concept.
 */
export function validateScheduleParams(
  values: Partial<Record<ScheduleParamKey, number>>,
): Partial<Record<ScheduleParamKey, string>> {
  const errors: Partial<Record<ScheduleParamKey, string>> = {};

  for (const [key, rule] of Object.entries(SCHEDULE_PARAM_RULES) as [
    ScheduleParamKey,
    ScheduleParamRule,
  ][]) {
    const value = values[key];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < rule.min || value > rule.max) {
      errors[key] = rule.message;
    }
  }

  // A buffer longer than the showing itself is legal in the database and
  // almost never intended, so it is worth a word rather than a rejection.
  if (
    values.bufferMinutes !== undefined &&
    values.slotMinutes !== undefined &&
    !errors.bufferMinutes &&
    !errors.slotMinutes &&
    values.bufferMinutes > values.slotMinutes
  ) {
    errors.bufferMinutes =
      "That buffer is longer than the showing itself, which will leave large gaps.";
  }

  return errors;
}
