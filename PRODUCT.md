# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences with opposite problems, on one system.

**Home sellers** (and the agent listing for them). They are at a kitchen table
in the evening, deciding which hours of their week they are willing to hand
over to strangers walking through their house. They set the rules once and want
to stop thinking about it. They are not scheduling experts and will not enjoy a
calendar grid; they think in phrases — "Saturday mornings, Wednesday after
work, not the weekend of the 7th."

**Home buyers.** They are on a phone between other commitments, usually at
lunch or late at night, and their constraint is time, not taste. They have a
narrow window of hours they can physically attend a showing, and the thing
they want is the short list of houses they can actually get into — not a
catalogue of houses they must then check one by one.

## Product Purpose

Find the overlap between when a house can be seen and when a buyer can see it,
and let the buyer take that time on the spot.

Success is the buyer never seeing a listing they cannot attend, and the seller
never receiving a request outside the hours they set.

## Positioning

Every listing site shows a buyer every house and leaves them to work out
whether they can get to any of them. This inverts it: availability is the
filter, not an afterthought. The search input is the buyer's own week.

The mechanism is an intersection of two people's time across two different
timezones, minus what is already booked and the travel buffer around it. It is
the whole product, it is computed rather than approximated, and it is why the
result can be booked immediately instead of requested and confirmed later.

## Operating Context

- A showing happens **at the property**, so the seller's hours are wall-clock
  time in the property's timezone — never the seller's browser timezone. A
  buyer may be in a different zone from the house they are booking.
- Sellers describe availability as a **repeating week** ("Saturdays 10–2"),
  with named exceptions ("away the 7th"), not as individual appointments.
- Buyers describe availability the same way, in their own zone.
- Between two showings the seller needs the house back for a while — turnover,
  travel, tidying. That gap is a listing setting, not a fixed constant.
- The stakes of a mistake are physical: two buyers sent to one address at one
  time is a real person standing on a real doorstep with a stranger.

## Capabilities and Constraints

**Built:**

- Seller: publish a listing, define repeating showing windows, black out dates,
  set showing length, buffer, booking horizon and minimum notice, see the
  showings booked against them.
- Buyer: describe availability in plain language or set it on a grid, see only
  the listings with real openings inside it, book a slot, cancel it.
- Availability parsing by Claude, structured and schema-validated. It fills the
  grid; it never decides what is bookable. Without an API key the feature turns
  itself off and the grid remains.
- Both roles reachable in one click from the landing page against seeded data.

**Constraints:**

- Next.js 16 App Router, Supabase Postgres, deployed on Vercel.
- Authorization is Row Level Security. Overlap prevention is a database
  EXCLUDE constraint, not application logic.
- Times are stored as instants; recurring rules are stored as wall clock.

**Deliberately not built** (a one-day build; these are named, not hidden):
messaging between buyer and seller, payments, photo upload, agent/brokerage
hierarchy, email or SMS notification, recurring showings, group open houses.

## Brand Commitments

None inherited. The product has no prior identity, name lineage, or logo.

Binding from the user: the entire interface, documentation, and code are in
English.

## Evidence on Hand

- A working scheduling engine with 68 passing tests, including DST transitions,
  buffer arithmetic, and a golden master over a cross-timezone scenario.
- Database-level proofs in pgTAP: tenant isolation and the overlap constraint.
- Seeded demonstration listings across three US timezones.

All listing content — addresses, prices, photographs, descriptions, the two
demo accounts — is **synthetic and must be labelled as such**. There are no
real customers, no real properties, no benchmarks, and no pricing. Nothing here
may be presented as a real listing or a real transaction.

## Product Principles

1. **Availability is the filter.** A listing a buyer cannot attend is not a
   result worth returning.
2. **The offer must be honest.** Anything the interface shows as bookable has
   to actually be bookable — which is why buffers are subtracted before slots
   are offered, not after.
3. **People describe time in phrases, machines need instants.** Accept the
   phrase; do the conversion once, carefully, and show the result back for
   confirmation.
4. **Correctness belongs in the database.** Ownership and double-booking are
   guarantees, not conventions the UI is trusted to uphold.
5. **Say what was cut.** Scope decisions are stated in the open rather than
   left looking like omissions.

## Accessibility & Inclusion

Times are the primary content, so they must survive being read aloud and being
read at 200% zoom: every slot carries its date, its weekday, and its timezone
in text, never by position or colour alone. The overlap between two people's
availability is the core idea and cannot be conveyed by colour alone either.
Keyboard operation of the availability grid is required — it is a
two-dimensional control and a pointer cannot be assumed.
