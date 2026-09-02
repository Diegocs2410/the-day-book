/**
 * Seed the demo.
 *
 * Creates the two accounts the landing page's one-click doors sign into, then
 * writes six listings across three timezones. The spread is deliberate: a
 * reviewer entering "Saturday mornings" should see the cross-timezone
 * translation do real work, not six houses in one city where every clock
 * agrees.
 *
 * Idempotent. Running it twice deletes what it wrote and writes it again,
 * rather than doubling the book — a seed that cannot be re-run is a seed
 * nobody trusts to run at all.
 *
 * Everything here is invented. No address, price, or person is real.
 *
 *   npm run seed
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";

// Load .env.local without a dependency; Node's --env-file does not merge with
// an already-populated environment the way this needs to on Windows.
for (const file of [".env.local", ".env"]) {
  try {
    const contents = readFileSync(path.join(process.cwd(), file), "utf8");
    for (const line of contents.split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Absent file is fine; the variables may come from the shell or from CI.
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const sellerEmail = process.env.DEMO_SELLER_EMAIL ?? "seller@demo.test";
const buyerEmail = process.env.DEMO_BUYER_EMAIL ?? "buyer@demo.test";
const password = process.env.DEMO_PASSWORD;

if (!url || !secret || !password) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY or DEMO_PASSWORD. Copy .env.example to .env.local and fill it in.",
  );
  process.exit(1);
}

const supabase = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const HOURS = (h: number) => h * 60;

/** Weekly showing windows, in the listing's own wall clock. */
type Window = { day: number; from: number; to: number };

const listings = [
  {
    address: "418 Rimrock Court",
    city: "Denver",
    state: "CO",
    timezone: "America/Denver",
    price: 742_000,
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1_840,
    description:
      "South-facing on a quiet cul-de-sac, ten minutes' walk to the light rail. The garage has been insulated.",
    slotMinutes: 30,
    bufferMinutes: 15,
    windows: [
      { day: 6, from: HOURS(10), to: HOURS(14) },
      { day: 3, from: HOURS(17), to: HOURS(20) },
      { day: 0, from: HOURS(12), to: HOURS(16) },
    ] as Window[],
  },
  {
    address: "2201 Marigold Street",
    city: "Denver",
    state: "CO",
    timezone: "America/Denver",
    price: 519_000,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 1_120,
    description: "A 1948 brick bungalow. Original floors, new roof, small greenhouse out back.",
    slotMinutes: 45,
    bufferMinutes: 30,
    windows: [
      { day: 2, from: HOURS(18), to: HOURS(21) },
      { day: 4, from: HOURS(18), to: HOURS(21) },
      { day: 6, from: HOURS(9), to: HOURS(12) },
    ] as Window[],
  },
  {
    address: "77 Harbourview Lane",
    city: "Seattle",
    state: "WA",
    timezone: "America/Los_Angeles",
    price: 1_180_000,
    bedrooms: 4,
    bathrooms: 3,
    squareFeet: 2_640,
    description: "Water on two sides from the upper floor. Steep driveway; the sellers ask that you park on the street.",
    slotMinutes: 60,
    bufferMinutes: 30,
    windows: [
      { day: 6, from: HOURS(11), to: HOURS(16) },
      { day: 0, from: HOURS(11), to: HOURS(15) },
    ] as Window[],
  },
  {
    address: "5 Bell Foundry Row",
    city: "Brooklyn",
    state: "NY",
    timezone: "America/New_York",
    price: 985_000,
    bedrooms: 2,
    bathrooms: 2,
    squareFeet: 1_310,
    description: "Converted foundry, top floor, north light all day. The freight lift is shared with two other units.",
    slotMinutes: 30,
    bufferMinutes: 15,
    windows: [
      { day: 1, from: HOURS(18), to: HOURS(21) },
      { day: 3, from: HOURS(18), to: HOURS(21) },
      { day: 6, from: HOURS(10), to: HOURS(13) },
    ] as Window[],
  },
  {
    address: "1140 Cedarbrook Drive",
    city: "Austin",
    state: "TX",
    timezone: "America/Chicago",
    price: 668_000,
    bedrooms: 4,
    bathrooms: 2.5,
    squareFeet: 2_180,
    description: "Two live oaks and a covered porch that runs the width of the house. Well water, tested last spring.",
    slotMinutes: 30,
    bufferMinutes: 20,
    windows: [
      { day: 5, from: HOURS(16), to: HOURS(19) },
      { day: 6, from: HOURS(9), to: HOURS(15) },
    ] as Window[],
  },
  {
    address: "308 Quarry Hill",
    city: "Austin",
    state: "TX",
    timezone: "America/Chicago",
    price: 424_000,
    bedrooms: 2,
    bathrooms: 1,
    squareFeet: 980,
    description: "Small, cheap, and structurally sound. Needs a kitchen. Priced for it.",
    slotMinutes: 20,
    bufferMinutes: 10,
    windows: [
      { day: 2, from: HOURS(17), to: HOURS(20) },
      { day: 4, from: HOURS(17), to: HOURS(20) },
      { day: 6, from: HOURS(13), to: HOURS(17) },
    ] as Window[],
  },
];

/** Create the account if it is missing; return its id either way. */
async function ensureUser(
  email: string,
  role: "seller" | "buyer",
  fullName: string,
  timezone: string,
): Promise<string> {
  const { data: existing } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const found = existing?.users.find((u) => u.email === email);
  if (found) {
    console.log(`  ${email} already exists`);
    return found.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, full_name: fullName, timezone },
  });
  if (error || !data.user) throw error ?? new Error(`could not create ${email}`);
  console.log(`  created ${email}`);
  return data.user.id;
}

async function main() {
  console.log("Seeding the day book.\n");

  console.log("Accounts:");
  const sellerId = await ensureUser(
    sellerEmail,
    "seller",
    "Demo Seller",
    "America/Denver",
  );
  // The buyer sits in Eastern on purpose: four of the six listings are on a
  // different clock, so the cross-timezone translation is visible immediately
  // rather than being a feature you have to go looking for.
  const buyerId = await ensureUser(buyerEmail, "buyer", "Demo Buyer", "America/New_York");

  // Idempotency. Cascades take the windows, blackouts and showings with them.
  const { error: clearError } = await supabase
    .from("listings")
    .delete()
    .eq("seller_id", sellerId);
  if (clearError) throw clearError;

  console.log("\nListings:");
  for (const listing of listings) {
    const { data: row, error } = await supabase
      .from("listings")
      .insert({
        seller_id: sellerId,
        address: listing.address,
        city: listing.city,
        state: listing.state,
        timezone: listing.timezone,
        price_cents: listing.price * 100,
        bedrooms: listing.bedrooms,
        bathrooms: listing.bathrooms,
        square_feet: listing.squareFeet,
        description: listing.description,
        is_published: true,
        slot_minutes: listing.slotMinutes,
        buffer_minutes: listing.bufferMinutes,
        booking_window_days: 21,
        min_notice_minutes: 120,
      })
      .select()
      .single();

    if (error || !row) throw error ?? new Error("listing insert returned nothing");

    const { error: windowError } = await supabase.from("showing_windows").insert(
      listing.windows.map((w) => ({
        listing_id: row.id,
        day_of_week: w.day,
        start_minute: w.from,
        end_minute: w.to,
      })),
    );
    if (windowError) throw windowError;

    console.log(
      `  ${listing.address}, ${listing.city} — ${listing.windows.length} windows, ${listing.timezone}`,
    );
  }

  // One listing gets a blackout, so the seller's book has something in its
  // margin and the engine's blackout path is exercised by the demo itself.
  const { data: first } = await supabase
    .from("listings")
    .select("id, timezone")
    .eq("seller_id", sellerId)
    .eq("address", "418 Rimrock Court")
    .single();

  if (first) {
    const nextSaturday = new Date();
    nextSaturday.setUTCDate(nextSaturday.getUTCDate() + ((6 - nextSaturday.getUTCDay() + 7) % 7 || 7));
    const iso = nextSaturday.toISOString().slice(0, 10);

    await supabase.from("blackout_dates").insert({
      listing_id: first.id,
      blackout_date: iso,
      reason: "Sellers away",
    });
    console.log(`\nBlackout: 418 Rimrock Court closed ${iso}`);
  }

  console.log(`\nDone. Sign in as ${sellerEmail} or ${buyerEmail}.`);
  console.log("Everything written above is invented demo data.");
  void buyerId;
}

main().catch((error) => {
  console.error("\nSeed failed:", error.message ?? error);
  process.exit(1);
});
