import { describe, expect, it } from "vitest";
import { decodeAvailability, encodeAvailability } from "./availability-url";
import type { RecurringRule } from "@/lib/scheduling";

const week: RecurringRule[] = [
  { dayOfWeek: 6, startMinute: 600, endMinute: 840 },
  { dayOfWeek: 3, startMinute: 1080, endMinute: 1260 },
];

describe("availability in the URL", () => {
  it("round-trips a week", () => {
    expect(decodeAvailability(encodeAvailability(week))).toEqual(week);
  });

  it("stays short enough to read in an address bar", () => {
    expect(encodeAvailability(week)).toBe("6.600-840_3.1080-1260");
  });

  it("treats an absent or empty parameter as no availability", () => {
    expect(decodeAvailability(undefined)).toEqual([]);
    expect(decodeAvailability(null)).toEqual([]);
    expect(decodeAvailability("")).toEqual([]);
  });

  it("drops malformed segments and keeps the good ones", () => {
    // The query string is hand-editable, so this is untrusted input.
    expect(decodeAvailability("6.600-840_garbage_3.1080-1260")).toEqual(week);
  });

  it("discards out-of-range values rather than clamping them", () => {
    // Clamping would silently turn a typo into a search nobody asked for.
    expect(decodeAvailability("9.600-840")).toEqual([]);
    expect(decodeAvailability("6.600-9999")).toEqual([]);
  });

  it("discards a rule that ends before it starts", () => {
    expect(decodeAvailability("6.840-600")).toEqual([]);
  });

  it("discards a zero-length rule", () => {
    expect(decodeAvailability("6.600-600")).toEqual([]);
  });
});
