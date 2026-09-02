import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_CHARS,
  describeRules,
  formatMinute,
  mergeRules,
  parseAvailability,
} from "./parse-availability";

/**
 * The model call itself is not tested here — asserting on a live model's output
 * would make the suite slow, costly, and flaky, and it would be testing
 * Anthropic rather than this codebase. What is tested is everything around it:
 * the guards that run before a request is made, and the normalization that runs
 * after one comes back. Those are the parts that can be wrong in a way that
 * reaches a buyer.
 */

describe("parseAvailability guards", () => {
  it("reports the feature as off when no API key is configured", async () => {
    // The app must stay usable without a key — the grid was always there.
    await expect(parseAvailability("Saturday mornings", { apiKey: "" })).resolves.toEqual(
      { ok: false, reason: "disabled" },
    );
  });

  it("rejects empty input before spending a request", async () => {
    await expect(parseAvailability("   ", { apiKey: "test-key" })).resolves.toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects oversized input before spending a request", async () => {
    const essay = "a".repeat(MAX_INPUT_CHARS + 1);
    await expect(parseAvailability(essay, { apiKey: "test-key" })).resolves.toEqual({
      ok: false,
      reason: "too_long",
    });
  });
});

describe("mergeRules", () => {
  it("merges overlapping blocks on the same day", () => {
    // A buyer is about to read these back in a grid; two bars where they said
    // one thing looks like a misunderstanding.
    expect(
      mergeRules([
        { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
        { dayOfWeek: 1, startMinute: 660, endMinute: 900 },
      ]),
    ).toEqual([{ dayOfWeek: 1, startMinute: 540, endMinute: 900 }]);
  });

  it("merges blocks that merely touch", () => {
    expect(
      mergeRules([
        { dayOfWeek: 3, startMinute: 540, endMinute: 720 },
        { dayOfWeek: 3, startMinute: 720, endMinute: 900 },
      ]),
    ).toEqual([{ dayOfWeek: 3, startMinute: 540, endMinute: 900 }]);
  });

  it("keeps separate blocks on the same day apart", () => {
    const rules = [
      { dayOfWeek: 2, startMinute: 540, endMinute: 660 },
      { dayOfWeek: 2, startMinute: 1020, endMinute: 1260 },
    ] as const;
    expect(mergeRules([...rules])).toEqual([...rules]);
  });

  it("never merges across days", () => {
    expect(
      mergeRules([
        { dayOfWeek: 1, startMinute: 1020, endMinute: 1440 },
        { dayOfWeek: 2, startMinute: 0, endMinute: 360 },
      ]),
    ).toHaveLength(2);
  });

  it("sorts by day so the grid reads Sunday first", () => {
    const merged = mergeRules([
      { dayOfWeek: 6, startMinute: 540, endMinute: 720 },
      { dayOfWeek: 0, startMinute: 540, endMinute: 720 },
    ]);
    expect(merged.map((r) => r.dayOfWeek)).toEqual([0, 6]);
  });

  it("does not mutate its input", () => {
    const input = [
      { dayOfWeek: 1 as const, startMinute: 540, endMinute: 720 },
      { dayOfWeek: 1 as const, startMinute: 660, endMinute: 900 },
    ];
    mergeRules(input);
    expect(input[0].endMinute).toBe(720);
  });
});

describe("describeRules", () => {
  it("reads back as something a buyer can check at a glance", () => {
    expect(
      describeRules([
        { dayOfWeek: 6, startMinute: 480, endMinute: 720 },
        { dayOfWeek: 1, startMinute: 1080, endMinute: 1260 },
      ]),
    ).toBe("Monday 18:00-21:00, Saturday 08:00-12:00");
  });

  it("says so when there is nothing to describe", () => {
    expect(describeRules([])).toBe("No availability set.");
  });
});

describe("formatMinute", () => {
  it("renders midnight at the end of a day as 00:00", () => {
    expect(formatMinute(1440)).toBe("00:00");
    expect(formatMinute(0)).toBe("00:00");
    expect(formatMinute(1110)).toBe("18:30");
  });
});
