-- Home Showing Scheduler — baseline schema.
--
-- Two ideas drive the whole design, and both push work *into* the database
-- rather than leaving it to application code:
--
--   1. Authorization is RLS. A seller can only ever see their own listings and
--      the showings booked on them; a buyer can only ever see their own
--      showings. Every route in the app is written as if it might be wrong —
--      the policies here are what actually holds.
--
--   2. Double-booking is a constraint, not a check. Read-then-insert always has
--      a window between the read and the insert. An EXCLUDE constraint closes
--      it in the one place both racing transactions have to pass through.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type user_role as enum ('seller', 'buyer');
create type showing_status as enum ('pending', 'confirmed', 'canceled');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'buyer',
  full_name text not null default '',
  -- The buyer's own zone. Their availability is wall-clock time here, and it
  -- is what every time in the buyer UI is rendered in.
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now()
);

comment on column profiles.timezone is
  'IANA zone. Buyer availability is wall-clock time in this zone, so a buyer who moves keeps their intent (weekday evenings) rather than their instants.';

-- New auth users get a profile automatically; the app never has to remember to
-- create one, so a missing profile can never become a live bug.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name, timezone)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'buyer'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'America/New_York')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------

create table listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles (id) on delete cascade,
  address text not null,
  city text not null,
  state text not null,
  -- The property's own zone. A showing happens at the house, so this is what
  -- the seller's windows are expressed in — never the seller's browser zone.
  timezone text not null,
  price_cents bigint not null check (price_cents >= 0),
  bedrooms smallint not null check (bedrooms >= 0),
  bathrooms numeric(3, 1) not null check (bathrooms >= 0),
  square_feet integer not null check (square_feet > 0),
  description text not null default '',
  photo_url text,
  is_published boolean not null default true,

  -- Scheduling parameters. These CHECKs are duplicated in
  -- src/lib/scheduling/rules.ts so the UI can say something readable before
  -- Postgres returns its own message; a test keeps the two lists in step.
  slot_minutes smallint not null default 30
    check (slot_minutes between 15 and 240),
  buffer_minutes smallint not null default 15
    check (buffer_minutes between 0 and 120),
  booking_window_days smallint not null default 14
    check (booking_window_days between 1 and 90),
  min_notice_minutes integer not null default 120
    check (min_notice_minutes between 0 and 10080),

  created_at timestamptz not null default now()
);

create index listings_seller_id_idx on listings (seller_id);
create index listings_published_idx on listings (is_published) where is_published;

-- ---------------------------------------------------------------------------
-- Showing windows — weekly wall-clock availability, in the listing's zone
-- ---------------------------------------------------------------------------

create table showing_windows (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  -- Minutes from local midnight. A `time` column would invite a reader to
  -- believe these carry an offset; they do not, and the type says so.
  start_minute smallint not null check (start_minute between 0 and 1440),
  end_minute smallint not null check (end_minute between 0 and 1440),
  constraint window_ends_after_it_starts check (end_minute > start_minute)
);

create index showing_windows_listing_id_idx on showing_windows (listing_id);

comment on table showing_windows is
  'Wall-clock time in the listing timezone, carrying no offset. Resolving these to instants happens once, in src/lib/scheduling/windows.ts.';

-- ---------------------------------------------------------------------------
-- Blackout dates
-- ---------------------------------------------------------------------------

create table blackout_dates (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  -- A civil date in the listing's zone. Not a timestamp: "the 7th" means the
  -- whole of the 7th as the house experiences it.
  blackout_date date not null,
  reason text not null default '',
  unique (listing_id, blackout_date)
);

-- ---------------------------------------------------------------------------
-- Showings
-- ---------------------------------------------------------------------------

create table showings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  buyer_id uuid not null references profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status showing_status not null default 'confirmed',
  buyer_note text not null default '',
  created_at timestamptz not null default now(),
  constraint showing_ends_after_it_starts check (ends_at > starts_at)
);

create index showings_listing_id_idx on showings (listing_id, starts_at);
create index showings_buyer_id_idx on showings (buyer_id, starts_at);

-- The centrepiece.
--
-- Two buyers load the same listing and both see 10:00 free. Both press Book.
-- Any amount of select-then-insert application logic still leaves a window
-- between the select and the insert where both are in flight. This constraint
-- removes the window: whichever transaction commits second raises 23P01, the
-- route turns that into a 409, and the second buyer is told the slot just went
-- — which is true, and is the only honest thing to tell them.
--
-- `tstzrange` is half-open, matching the engine's intervals, so a showing
-- ending at 11:00 and one starting at 11:00 are neighbours rather than a
-- conflict. Canceled showings are excluded so a slot frees up again.
alter table showings
  add constraint showings_no_overlap
  exclude using gist (
    listing_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'canceled');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table listings enable row level security;
alter table showing_windows enable row level security;
alter table blackout_dates enable row level security;
alter table showings enable row level security;

-- Profiles: your own row and no one else's.
create policy "read own profile"
  on profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "update own profile"
  on profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Listings: published listings are public — buyers browse without an account,
-- which is how search works for a signed-out visitor. Writes are the real
-- boundary here, and they are owner-only.
create policy "anyone reads published listings"
  on listings for select to anon, authenticated
  using (is_published or seller_id = (select auth.uid()));

create policy "seller inserts own listings"
  on listings for insert to authenticated
  with check (seller_id = (select auth.uid()));

create policy "seller updates own listings"
  on listings for update to authenticated
  using (seller_id = (select auth.uid()))
  with check (seller_id = (select auth.uid()));

create policy "seller deletes own listings"
  on listings for delete to authenticated
  using (seller_id = (select auth.uid()));

-- Windows and blackouts: readable by anyone, because search computes slots for
-- signed-out visitors. Writable only by the listing's owner.
create policy "anyone reads windows of published listings"
  on showing_windows for select to anon, authenticated
  using (
    exists (
      select 1 from listings l
      where l.id = showing_windows.listing_id
        and (l.is_published or l.seller_id = (select auth.uid()))
    )
  );

create policy "seller writes own windows"
  on showing_windows for all to authenticated
  using (
    exists (
      select 1 from listings l
      where l.id = showing_windows.listing_id and l.seller_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from listings l
      where l.id = showing_windows.listing_id and l.seller_id = (select auth.uid())
    )
  );

create policy "anyone reads blackouts of published listings"
  on blackout_dates for select to anon, authenticated
  using (
    exists (
      select 1 from listings l
      where l.id = blackout_dates.listing_id
        and (l.is_published or l.seller_id = (select auth.uid()))
    )
  );

create policy "seller writes own blackouts"
  on blackout_dates for all to authenticated
  using (
    exists (
      select 1 from listings l
      where l.id = blackout_dates.listing_id and l.seller_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from listings l
      where l.id = blackout_dates.listing_id and l.seller_id = (select auth.uid())
    )
  );

-- Showings: the two-sided boundary.
--
-- A buyer sees their own showings. A seller sees showings on their own
-- listings. Neither sees anything else — in particular one buyer can never
-- read another buyer's name, note, or schedule, which `buyer_note` turns into
-- a real privacy question rather than a theoretical one.
create policy "buyer reads own showings"
  on showings for select to authenticated
  using (buyer_id = (select auth.uid()));

create policy "seller reads showings on own listings"
  on showings for select to authenticated
  using (
    exists (
      select 1 from listings l
      where l.id = showings.listing_id and l.seller_id = (select auth.uid())
    )
  );

create policy "buyer books for themselves"
  on showings for insert to authenticated
  with check (
    buyer_id = (select auth.uid())
    and exists (
      select 1 from listings l
      where l.id = showings.listing_id and l.is_published
    )
  );

create policy "buyer cancels own showings"
  on showings for update to authenticated
  using (buyer_id = (select auth.uid()))
  with check (buyer_id = (select auth.uid()));

create policy "seller updates showings on own listings"
  on showings for update to authenticated
  using (
    exists (
      select 1 from listings l
      where l.id = showings.listing_id and l.seller_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from listings l
      where l.id = showings.listing_id and l.seller_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Privileges
--
-- Revoke at table level before granting anything back. In Postgres privileges
-- add up: a later table-wide GRANT silently widens anything granted narrowly
-- here, and revoking a single column afterwards subtracts nothing from it.
-- ---------------------------------------------------------------------------

revoke all on profiles, listings, showing_windows, blackout_dates, showings
  from anon, authenticated;

grant select on listings, showing_windows, blackout_dates to anon, authenticated;
grant select, insert, update, delete on listings, showing_windows, blackout_dates
  to authenticated;
grant select, update on profiles to authenticated;
grant select, insert, update on showings to authenticated;

-- A showing is never hard-deleted: cancellation is a status change, so the
-- record of who booked what survives. No DELETE is granted, on purpose.
