import Link from "next/link";
import { redirect } from "next/navigation";
import { ListingForm } from "@/components/listing-form";
import { RuledWeek } from "@/components/ruled-week";
import { Empty, Stamp } from "@/components/ui";
import { toRecurringRules } from "@/lib/search";
import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import type { ListingWithSchedule, ShowingRow } from "@/lib/types";

/**
 * The seller's book.
 *
 * One page per listing: the week it is open, drawn on the same rule the buyer
 * sees, and the showings written against it underneath. No dashboard tiles,
 * no metric cards — a seller wants to know which strangers are coming to their
 * house and when.
 */
export default async function SellerPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/");

  const supabase = await createClient();

  // RLS scopes both of these to this seller. There is no `.eq("seller_id", …)`
  // here because there does not need to be, and adding one would imply the
  // policy might not hold.
  const { data: listings } = await supabase
    .from("listings")
    .select("*, showing_windows (*), blackout_dates (*)")
    .order("created_at", { ascending: false });

  const { data: showings } = await supabase
    .from("showings")
    .select("*")
    .neq("status", "canceled")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at");

  const book = (listings ?? []) as unknown as ListingWithSchedule[];
  const byListing = new Map<string, ShowingRow[]>();
  for (const showing of (showings ?? []) as ShowingRow[]) {
    byListing.set(showing.listing_id, [...(byListing.get(showing.listing_id) ?? []), showing]);
  }

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
          Seller&rsquo;s side · {profile.full_name || "demo account"}
        </span>
      </header>

      <section className="pt-8">
        <h1 className="ledger-margin text-[1.5rem] font-bold tracking-[-0.02em]">
          Your book
        </h1>

        {book.length === 0 ? (
          <Empty
            headline="Nothing written down yet."
            body="A page in this book is one house plus the hours it can be seen. Buyers only ever see the hours you mark, so the grid below is the listing — everything else is description."
          />
        ) : (
          <div className="mt-6">
            {book.map((listing) => (
              <ListingPage
                key={listing.id}
                listing={listing}
                showings={byListing.get(listing.id) ?? []}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-14 border-t pt-8" style={{ borderColor: "var(--rule-strong)" }}>
        <h2 className="colhead mb-5">Open a new page</h2>
        <ListingForm />
      </section>
    </main>
  );
}

function ListingPage({
  listing,
  showings,
}: {
  listing: ListingWithSchedule;
  showings: ShowingRow[];
}) {
  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(listing.price_cents / 100);

  const blackouts = listing.blackout_dates ?? [];

  return (
    <article className="mb-10 border-b pb-8" style={{ borderColor: "var(--rule-strong)" }}>
      <div className="ledger-margin">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h3 className="text-[1.0625rem] font-semibold">{listing.address}</h3>
          <p className="tabular text-[1rem] font-semibold">{money}</p>
        </div>
        <p className="mt-0.5 text-[0.8125rem]" style={{ color: "var(--text-soft)" }}>
          {listing.city}, {listing.state} · {listing.bedrooms} bd · {listing.bathrooms} ba ·{" "}
          {listing.square_feet.toLocaleString()} sq ft · {listing.slot_minutes}-minute
          showings, {listing.buffer_minutes}-minute gap · house clock{" "}
          {listing.timezone.split("/")[1]?.replace("_", " ")}
        </p>

        <div className="mt-5">
          <RuledWeek
            seller={toRecurringRules(listing.showing_windows ?? [])}
            sellerLabel="Open for showings"
          />
        </div>

        {blackouts.length > 0 && (
          <p className="mt-4 text-[0.8125rem]" style={{ color: "var(--margin-rule)" }}>
            Closed on{" "}
            {blackouts
              .map((b) =>
                new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${b.blackout_date}T00:00:00Z`)),
              )
              .join(", ")}
            .
          </p>
        )}

        <div className="mt-6">
          <h4 className="colhead border-b pb-1.5" style={{ borderColor: "var(--rule)" }}>
            Booked against this page
          </h4>
          {showings.length === 0 ? (
            <p className="pt-3 text-[0.8125rem]" style={{ color: "var(--text-faint)" }}>
              Nobody has booked yet.
            </p>
          ) : (
            <ul>
              {showings.map((showing) => (
                <li
                  key={showing.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
                  style={{ borderColor: "var(--rule)" }}
                >
                  <span className="tabular text-[0.875rem]">
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: listing.timezone,
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZoneName: "short",
                    }).format(new Date(showing.starts_at))}
                  </span>
                  <Stamp>{showing.status}</Stamp>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
