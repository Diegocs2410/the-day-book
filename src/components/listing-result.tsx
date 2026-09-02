"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stamp } from "@/components/ui";
import type { Slot } from "@/lib/scheduling";
import type { ListingWithSchedule } from "@/lib/types";

/**
 * One matched listing, with the slots this buyer can actually take.
 *
 * Every slot carries its weekday, date, time and timezone in text. A buyer in
 * New York booking a house in Denver is told both clocks, because "10:00" on
 * its own has sent people to the wrong doorstep at the wrong hour.
 */

function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function partsIn(iso: string, timeZone: string) {
  return {
    day: new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(new Date(iso)),
    time: new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso)),
    zone:
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
        .formatToParts(new Date(iso))
        .find((p) => p.type === "timeZoneName")?.value ?? "",
  };
}

export function ListingResult({
  listing,
  slots,
  matchedMinutes,
  buyerTimeZone,
  signedIn,
}: {
  listing: ListingWithSchedule;
  slots: Slot[];
  matchedMinutes: number;
  buyerTimeZone: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [booking, setBooking] = useState<string | null>(null);
  const [booked, setBooked] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const crossZone = listing.timezone !== buyerTimeZone;
  const visible = showAll ? slots : slots.slice(0, 6);

  async function book(slot: Slot) {
    setBooking(slot.startsAt);
    setError(null);
    try {
      const response = await fetch("/api/showings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.id, startsAt: slot.startsAt }),
      });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error);
        // A 409 means the calendar moved under us. Re-fetching is the only
        // honest response — the slot list on screen is now a lie.
        if (response.status === 409) router.refresh();
        return;
      }
      setBooked(slot);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBooking(null);
    }
  }

  const local = booked ? partsIn(booked.startsAt, listing.timezone) : null;
  const mine = booked ? partsIn(booked.startsAt, buyerTimeZone) : null;

  return (
    // The two data attributes are the only test hooks in the app. The end-to-end
    // race test has to POST a slot that genuinely exists, and inventing a time
    // would test nothing; reading one the server actually rendered does.
    <article
      className="border-b py-6"
      style={{ borderColor: "var(--rule-strong)" }}
      data-listing={listing.id}
    >
      <div className="ledger-margin">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h3 className="text-[1.0625rem] font-semibold">{listing.address}</h3>
          <p className="tabular text-[1rem] font-semibold">{money(listing.price_cents)}</p>
        </div>

        <p className="mt-0.5 text-[0.8125rem]" style={{ color: "var(--text-soft)" }}>
          {listing.city}, {listing.state} · {listing.bedrooms} bd · {listing.bathrooms} ba ·{" "}
          {listing.square_feet.toLocaleString()} sq ft
          {crossZone && (
            <>
              {" "}
              · <span style={{ color: "var(--margin-rule)" }}>house clock: {listing.timezone.split("/")[1]?.replace("_", " ")}</span>
            </>
          )}
        </p>

        {listing.description && (
          <p className="mt-2 max-w-[68ch] text-[0.875rem]" style={{ color: "var(--text-soft)" }}>
            {listing.description}
          </p>
        )}

        {booked && local && mine ? (
          <div className="slip slip-print mt-4 max-w-[26rem] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="colhead" style={{ color: "var(--canary-ink)" }}>
                  Your copy
                </p>
                <p className="mt-1 text-[0.9375rem] font-semibold" style={{ color: "var(--text)" }}>
                  {local.day}, {local.time} {local.zone}
                </p>
                {crossZone && (
                  <p className="mt-0.5 text-[0.8125rem]" style={{ color: "var(--text-soft)" }}>
                    {mine.time} {mine.zone} where you are
                  </p>
                )}
                <p className="mt-2 text-[0.8125rem]" style={{ color: "var(--text-soft)" }}>
                  {listing.address}, {listing.city}
                </p>
              </div>
              <Stamp>Booked</Stamp>
            </div>
            <p className="mt-3 border-t pt-2 text-[0.75rem]" style={{ borderColor: "var(--slip-rule)", color: "var(--text-soft)" }}>
              The seller&rsquo;s book has the other half of this slip. Cancel from
              your showings page.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {visible.map((slot) => {
                const atHouse = partsIn(slot.startsAt, listing.timezone);
                const atMine = partsIn(slot.startsAt, buyerTimeZone);
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    data-starts-at={slot.startsAt}
                    onClick={() => book(slot)}
                    disabled={!signedIn || booking !== null}
                    aria-label={`Book ${atHouse.day} at ${atHouse.time} ${atHouse.zone}${
                      crossZone ? `, ${atMine.time} ${atMine.zone} your time` : ""
                    }`}
                    className="rounded-[2px] px-2.5 py-1.5 text-left text-[0.8125rem] ring-1 transition-colors duration-150 hover:bg-[var(--surface-sunk)] disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ "--tw-ring-color": "var(--rule-strong)" } as React.CSSProperties}
                  >
                    <span className="colhead block text-[0.5625rem]">{atHouse.day}</span>
                    <span className="tabular font-semibold">{atHouse.time}</span>
                    <span className="tabular ml-1 text-[0.6875rem]" style={{ color: "var(--text-faint)" }}>
                      {atHouse.zone}
                    </span>
                    {crossZone && (
                      <span className="tabular block text-[0.6875rem]" style={{ color: "var(--margin-rule)" }}>
                        {atMine.time} {atMine.zone} yours
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4">
              {slots.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="text-[0.75rem] underline underline-offset-2"
                  style={{ color: "var(--text-soft)" }}
                >
                  {showAll ? "Show fewer" : `${slots.length - 6} more slots`}
                </button>
              )}
              <span className="text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
                {Math.round(matchedMinutes / 60)} hours of this listing land inside your week.
              </span>
            </div>

            {!signedIn && (
              <p className="mt-3 text-[0.8125rem]" style={{ color: "var(--text-soft)" }}>
                Sign in as the demo buyer from the front page to take one of these.
              </p>
            )}
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[0.8125rem]" style={{ color: "var(--margin-rule)" }}>
            {error}
          </p>
        )}
      </div>
    </article>
  );
}
