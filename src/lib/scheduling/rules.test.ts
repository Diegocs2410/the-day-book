import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCHEDULE_PARAM_RULES, validateScheduleParams } from "./rules";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

/**
 * The bounds in `rules.ts` exist to give a seller a readable message before the
 * request leaves the browser. That is only worth doing while they agree with
 * the database, so this reads the actual SQL rather than trusting a comment.
 *
 * It scans every migration and takes the *last* declaration of each CHECK: a
 * CHECK constraint is replaced rather than widened, and an applied migration is
 * never edited, so a later migration re-declaring a bound is the live one.
 */
function checkBoundsFromMigrations(): Map<string, { min: number; max: number }> {
  const sql = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");

  const bounds = new Map<string, { min: number; max: number }>();
  const pattern =
    /check\s*\(\s*([a-z_]+)\s+between\s+(-?\d+)\s+and\s+(-?\d+)\s*\)/gi;

  for (const match of sql.matchAll(pattern)) {
    bounds.set(match[1], { min: Number(match[2]), max: Number(match[3]) });
  }
  return bounds;
}

describe("scheduling parameter rules", () => {
  const bounds = checkBoundsFromMigrations();

  it("finds the CHECK constraints it is supposed to mirror", () => {
    // Guards the guard: a regex that silently matches nothing would make every
    // assertion below vacuously pass.
    expect(bounds.size).toBeGreaterThanOrEqual(
      Object.keys(SCHEDULE_PARAM_RULES).length,
    );
  });

  it.each(Object.entries(SCHEDULE_PARAM_RULES))(
    "%s matches the database CHECK",
    (_key, rule) => {
      const dbBound = bounds.get(rule.column);
      expect(
        dbBound,
        `no CHECK found for ${rule.column} in supabase/migrations`,
      ).toBeDefined();
      expect({ min: rule.min, max: rule.max }).toEqual(dbBound);
    },
  );
});

describe("validateScheduleParams", () => {
  it("accepts values inside every bound", () => {
    expect(
      validateScheduleParams({
        slotMinutes: 30,
        bufferMinutes: 15,
        bookingWindowDays: 14,
        minNoticeMinutes: 120,
      }),
    ).toEqual({});
  });

  it("rejects values outside a bound with a message a seller can act on", () => {
    const errors = validateScheduleParams({ slotMinutes: 5 });
    expect(errors.slotMinutes).toBe(SCHEDULE_PARAM_RULES.slotMinutes.message);
  });

  it("rejects a non-integer, which Postgres would silently round", () => {
    expect(validateScheduleParams({ bookingWindowDays: 7.5 }).bookingWindowDays)
      .toBeDefined();
  });

  it("ignores fields that were not supplied", () => {
    expect(validateScheduleParams({})).toEqual({});
  });

  it("warns when the buffer is longer than the showing", () => {
    // Legal in the database, almost never intended.
    const errors = validateScheduleParams({ slotMinutes: 30, bufferMinutes: 60 });
    expect(errors.bufferMinutes).toContain("longer than the showing");
  });

  it("does not add the buffer warning on top of a range error", () => {
    const errors = validateScheduleParams({ slotMinutes: 30, bufferMinutes: 999 });
    expect(errors.bufferMinutes).toBe(SCHEDULE_PARAM_RULES.bufferMinutes.message);
  });
});
