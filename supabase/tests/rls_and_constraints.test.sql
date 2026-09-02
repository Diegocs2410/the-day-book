-- Database-level guarantees, tested in the database.
--
-- Everything asserted here is something the application layer *cannot* be
-- trusted to enforce: a route can forget an ownership check, and no amount of
-- select-then-insert closes a race. These run against real Postgres, as the
-- `authenticated` and `anon` roles, with a real JWT claim — the same way
-- PostgREST reaches the tables from a browser.

begin;
select plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures: two sellers with a listing each, and two buyers.
-- Deterministic UUIDs — a random fixture makes a CI failure irreproducible.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seller-a@test.local',
   '{"role":"seller","full_name":"Seller A"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seller-b@test.local',
   '{"role":"seller","full_name":"Seller B"}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'buyer-a@test.local',
   '{"role":"buyer","full_name":"Buyer A"}'::jsonb),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'buyer-b@test.local',
   '{"role":"buyer","full_name":"Buyer B"}'::jsonb);

-- The trigger should have made a profile for each, without the app asking.
select is(
  (select count(*)::int from public.profiles),
  4,
  'every new auth user gets a profile from the trigger'
);
select is(
  (select role::text from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'seller',
  'the role from user metadata reaches the profile'
);

insert into public.listings
  (id, seller_id, address, city, state, timezone, price_cents, bedrooms, bathrooms, square_feet)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '1 A Street', 'Denver', 'CO', 'America/Denver', 75000000, 3, 2.0, 1800),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   '2 B Avenue', 'Austin', 'TX', 'America/Chicago', 62000000, 4, 3.0, 2400);

-- ---------------------------------------------------------------------------
-- Tenant isolation: one seller must never reach another seller's data
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.listings where seller_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'seller A can READ seller B''s published listing — listings are public by design'
);

-- Reading is public; writing is the actual boundary.
select throws_ok(
  $$ update public.listings set price_cents = 1 where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1 $$,
  'P0001',
  null,
  'seller A cannot UPDATE seller B''s listing'
);

select is(
  (select count(*)::int from (
    update public.listings set price_cents = 1
    where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1
  ) t),
  0,
  'an update against another seller''s listing changes zero rows'
);

select throws_ok(
  $$ insert into public.listings (seller_id, address, city, state, timezone, price_cents, bedrooms, bathrooms, square_feet)
     values ('22222222-2222-2222-2222-222222222222', 'x', 'x', 'XX', 'UTC', 1, 1, 1, 1) $$,
  '42501',
  null,
  'seller A cannot create a listing owned by seller B'
);

select is(
  (select count(*)::int from (
    delete from public.listings where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1
  ) t),
  0,
  'seller A cannot DELETE seller B''s listing'
);

-- Profiles are private even though listings are not.
select is(
  (select count(*)::int from public.profiles),
  1,
  'a seller sees only their own profile row'
);

-- ---------------------------------------------------------------------------
-- Windows belong to the listing's owner
-- ---------------------------------------------------------------------------

insert into public.showing_windows (listing_id, day_of_week, start_minute, end_minute)
values ('aaaaaaaa-0000-0000-0000-000000000001', 6, 600, 780);

select is(
  (select count(*)::int from public.showing_windows),
  1,
  'seller A can add a window to their own listing'
);

select throws_ok(
  $$ insert into public.showing_windows (listing_id, day_of_week, start_minute, end_minute)
     values ('bbbbbbbb-0000-0000-0000-000000000002', 6, 600, 780) $$,
  '42501',
  null,
  'seller A cannot add a window to seller B''s listing'
);

select throws_ok(
  $$ insert into public.showing_windows (listing_id, day_of_week, start_minute, end_minute)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 6, 780, 600) $$,
  '23514',
  null,
  'a window that ends before it starts is rejected'
);

-- ---------------------------------------------------------------------------
-- The overlap constraint — the reason two buyers cannot take one slot
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

insert into public.showings (listing_id, buyer_id, starts_at, ends_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
        '2026-06-06T16:00:00Z', '2026-06-06T16:30:00Z');

select is(
  (select count(*)::int from public.showings),
  1,
  'buyer A books a slot'
);

-- Buyer B, racing for the same slot. This is the assertion the whole schema
-- exists for: it fails at the constraint, not at an application check that
-- another transaction could have slipped past.
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select throws_ok(
  $$ insert into public.showings (listing_id, buyer_id, starts_at, ends_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
             '2026-06-06T16:00:00Z', '2026-06-06T16:30:00Z') $$,
  '23P01',
  null,
  'a second buyer cannot take a slot that is already booked'
);

select throws_ok(
  $$ insert into public.showings (listing_id, buyer_id, starts_at, ends_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
             '2026-06-06T16:15:00Z', '2026-06-06T16:45:00Z') $$,
  '23P01',
  null,
  'a partially overlapping showing is rejected too'
);

-- Half-open ranges: back-to-back is fine, and the engine relies on it.
insert into public.showings (listing_id, buyer_id, starts_at, ends_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444',
        '2026-06-06T16:30:00Z', '2026-06-06T17:00:00Z');

select is(
  (select count(*)::int from public.showings where buyer_id = '44444444-4444-4444-4444-444444444444'),
  1,
  'a showing starting exactly when another ends is allowed'
);

-- The same time on a *different* listing is not a conflict.
insert into public.showings (listing_id, buyer_id, starts_at, ends_at)
values ('bbbbbbbb-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444',
        '2026-06-06T16:00:00Z', '2026-06-06T16:30:00Z');

select is(
  (select count(*)::int from public.showings where buyer_id = '44444444-4444-4444-4444-444444444444'),
  2,
  'the constraint is scoped per listing, not global'
);

-- ---------------------------------------------------------------------------
-- Buyer privacy: buyer B must not see buyer A's showing or note
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.showings
   where buyer_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'buyer B cannot read buyer A''s showings'
);

-- ---------------------------------------------------------------------------
-- Anonymous visitors: browsing works, writing does not
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = null;

select is(
  (select count(*)::int from public.listings),
  2,
  'a signed-out visitor can browse published listings'
);

select throws_ok(
  $$ insert into public.showings (listing_id, buyer_id, starts_at, ends_at)
     values ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
             '2026-06-13T16:00:00Z', '2026-06-13T16:30:00Z') $$,
  '42501',
  null,
  'a signed-out visitor cannot book by talking straight to the API'
);

select * from finish();
rollback;
