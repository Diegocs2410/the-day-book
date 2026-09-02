-- Let a signed-out visitor see *that* a slot is taken, never *who* took it.
--
-- The landing page invites people to browse without an account, and the search
-- needs booked showings to subtract them from the offered slots. But `showings`
-- carries `buyer_id` and `buyer_note` — a free-text field where somebody will
-- eventually write something personal — and granting `anon` a read on that
-- table would publish both to the internet.
--
-- So the busy times get their own object exposing three columns and nothing
-- else. The view is not `security_invoker`, so it runs as its owner and reads
-- past RLS; that is exactly why it may only ever select columns that are safe
-- for everyone to see. Adding a column here is a privacy decision, not a
-- convenience — which is what the comment below is for.
--
-- Written as a new migration rather than an edit to the baseline. The baseline
-- has already been applied (in CI, on every run), and "never edit an applied
-- migration" is a rule that has to hold for its author first.

create view public.listing_busy_times
with (security_invoker = off) as
select
  listing_id,
  starts_at,
  ends_at
from public.showings
where status <> 'canceled';

comment on view public.listing_busy_times is
  'Booked intervals per listing, readable by anyone. Runs as owner and bypasses RLS on showings, so it must never expose buyer_id, buyer_note, or any other column identifying who booked.';

grant select on public.listing_busy_times to anon, authenticated;
