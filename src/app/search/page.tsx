import Link from "next/link";
import { Suspense } from "react";
import { AvailabilityPanel } from "@/components/availability-panel";
import { ListingResult } from "@/components/listing-result";
import { Empty } from "@/components/ui";
import { decodeAvailability } from "@/lib/availability-url";
import { searchListings } from "@/lib/search";
import { getCurrentProfile } from "@/lib/supabase/server";

/**
 * The buyer's page.
 *
 * Availability comes from the query string, which makes a result set a link a
 * buyer can send to someone else. The search itself runs on the server: the
 * engine needs every listing's windows, blackouts and booked showings, and
 * shipping all of that to the browser to filter it there would be both slower
 * and a way to leak other people's bookings.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>;
}) {
  const { a } = await searchParams;
  const availability = decodeAvailability(a);
  const profile = await getCurrentProfile();
  const buyerTimeZone = profile?.timezone ?? "America/New_York";

  return (
    <main className="mx-auto max-w-[68rem] px-5 pb-24 pt-8 sm:px-8">
      <header
        className="flex items-baseline justify-between gap-4 border-b pb-3"
        style={{ borderColor: "var(--rule-strong)" }}
      >
        <Link href="/" className="colhead">
          The Day Book
        </Link>
        <span className="colhead">
          Buyer&rsquo;s side · {buyerTimeZone.split("/")[1]?.replace("_", " ")}
        </span>
      </header>

      <section className="pt-8">
        <h1 className="ledger-margin text-[1.5rem] font-bold tracking-[-0.02em]">
          Your week
        </h1>
        <div className="mt-5">
          <Suspense fallback={<p className="colhead">Loading your week…</p>}>
            <AvailabilityPanel initial={availability} />
          </Suspense>
        </div>
      </section>

      <section className="mt-12">
        <h2
          className="colhead border-b pb-2"
          style={{ borderColor: "var(--rule-strong)" }}
        >
          What you can reach
        </h2>
        <Suspense fallback={<Loading />}>
          <Results
            availability={availability}
            buyerTimeZone={buyerTimeZone}
            signedIn={Boolean(profile)}
          />
        </Suspense>
      </section>
    </main>
  );
}

function Loading() {
  // A skeleton rather than a spinner: the shape of the answer is already known.
  return (
    <div className="space-y-4 pt-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="ledger-margin animate-pulse">
          <div className="h-4 w-64 rounded-[2px]" style={{ background: "var(--surface-sunk)" }} />
          <div
            className="mt-2 h-3 w-40 rounded-[2px]"
            style={{ background: "var(--surface-sunk)" }}
          />
        </div>
      ))}
    </div>
  );
}

async function Results({
  availability,
  buyerTimeZone,
  signedIn,
}: {
  availability: ReturnType<typeof decodeAvailability>;
  buyerTimeZone: string;
  signedIn: boolean;
}) {
  if (availability.length === 0) {
    return (
      <Empty
        headline="Tell the book when you are free."
        body="Type a sentence, or fill in the grid above. Only the listings with an opening inside those hours come back — the rest are houses you could not get into anyway."
      />
    );
  }

  let matches;
  try {
    matches = await searchListings({ availability, buyerTimeZone });
  } catch {
    return (
      <Empty
        headline="The register could not be read."
        body="The database did not answer. If you are running this locally, check that Supabase is up and the environment variables in .env.local are set."
      />
    );
  }

  if (matches.length === 0) {
    return (
      <Empty
        headline="Nothing overlaps those hours."
        body="Every published listing was checked against your week and none of them have an opening inside it. Widening a single evening is usually enough."
      />
    );
  }

  return (
    <div>
      <p className="ledger-margin py-4 text-[0.8125rem]" style={{ color: "var(--text-soft)" }}>
        {matches.length} listing{matches.length === 1 ? "" : "s"} you can reach, most
        available first.
      </p>
      {matches.map((match) => (
        <ListingResult
          key={match.listing.id}
          listing={match.listing}
          slots={match.slots}
          matchedMinutes={match.matchedMinutes}
          buyerTimeZone={buyerTimeZone}
          signedIn={signedIn}
        />
      ))}
    </div>
  );
}
