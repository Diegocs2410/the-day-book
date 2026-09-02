import { recurringRuleSchema, type RecurringRule } from "@/lib/scheduling";

/**
 * Availability, encoded for the URL.
 *
 * The buyer's availability lives in the query string rather than in a session,
 * for one reason that matters more than it sounds: a search result becomes a
 * link. A buyer can send "here are the three houses I can actually get to on
 * Saturday" to their partner, and it still means the same thing when opened.
 * It also makes the search page shareable, bookmarkable, and reloadable
 * without re-entering a week.
 *
 * Format is `day.start-end` joined by `_`, minutes as integers:
 *   `6.600-840_3.1080-1260`
 * Compact enough to stay readable in the address bar, and strict enough that
 * anything malformed is dropped rather than guessed at.
 */

export function encodeAvailability(rules: RecurringRule[]): string {
  return rules
    .map((r) => `${r.dayOfWeek}.${r.startMinute}-${r.endMinute}`)
    .join("_");
}

export function decodeAvailability(encoded: string | undefined | null): RecurringRule[] {
  if (!encoded) return [];

  const rules: RecurringRule[] = [];
  for (const part of encoded.split("_")) {
    const match = /^(\d)\.(\d{1,4})-(\d{1,4})$/.exec(part);
    if (!match) continue;

    // The URL is user-editable, so every value goes through the same schema the
    // engine uses. A hand-typed `9.0-99999` is discarded, not clamped.
    const candidate = recurringRuleSchema.safeParse({
      dayOfWeek: Number(match[1]),
      startMinute: Number(match[2]),
      endMinute: Number(match[3]),
    });
    if (candidate.success) rules.push(candidate.data);
  }
  return rules;
}
