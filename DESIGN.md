# Design

## Direction contract

**THESIS.** A showing is an appointment, and appointments were kept in a ruled
book long before they were kept in software. This surface is that book: a time
gutter, feint rules, a red margin, a date stamp. It refuses the property-portal
arrangement — the photo-card grid with a blue accent and a map pin — because
that layout answers "what does it look like" when the only question here is
"when can I get in." It equally refuses that layout's opposite, the white
calendar-SaaS page with a gradient.

**OWN-WORLD.** Bookcloth ink-blue chrome against a cool ledger-paper working
surface — paper white with a blue cast, never cream. Horizontal feint-blue
rules at a fixed rhythm, one red margin rule down the left of every ledger
block, violet date-stamp for anything committed, canary carbon-copy stock for
the buyer's own record. Archivo throughout, tabular figures, letterspaced
uppercase for column heads. Rules and hatches do the work that borders and
shadows would do elsewhere.

**STORY.** A visitor understands within one viewport that this matches two
people's weeks rather than listing houses; believes it because the match is
drawn in front of them, not asserted; and goes through one of two doors —
keeping a book, or finding a slot in someone else's.

**FIRST VIEWPORT.** Full-bleed ledger paper. A single ruled week runs across
the page. The seller's open hours enter as an ink-blue band; the buyer's
availability slides in over them as a canary band; where they cross, the
overlap resolves into stamped, bookable slots. Headline sits in the left
margin, above the rule. Both doors — *Keep a book* / *Find a slot* — sit on the
first ruled line beneath the animation, in the margin's own vocabulary.

**FORM.** The Day Book, candidate 4 of seven grounded directions ordered by
resonance (dimension line, departure board, tide table, **day book**, window
card, plat, site sign). Seed key `c4991fb4`, assigned index 4. Weighed against
dealt challengers `scientific-notation-oscilloscope-signal-bench` and
`digital-design-canon-metro-typographic-tiles`; both lost on audience
identification, and metro tiles additionally on product clarity, having no way
to draw an interval.

---

## Durable system rules

### Light and dark

Light-first, and dark is not an inversion trick. A ledger's pages are light and
its binding is dark, so light mode is the **open book** — paper ground, ink
rules — and dark mode is the **closed book** — bookcloth ground, paper-white
rules. Both are the same object.

The use scene decides: a seller sets their week at a kitchen table in the
evening, a buyer checks slots on a phone at lunch and again at midnight. Both
lights are real, so both are built.

### Color roles

Committed strategy: bookcloth carries the chrome at page scale rather than
appearing as an accent.

| Role | Meaning | Never used for |
|---|---|---|
| Bookcloth ink-blue | Chrome, rails, primary action | Warnings, data |
| Ledger paper | The working surface | Chrome |
| Feint blue | The ruled rhythm, 1px | Text, borders of controls |
| Margin red | The margin rule; blackouts and exceptions | Primary actions — red on a button reads as destructive |
| Stamp violet | Anything committed: a booked showing | Anything provisional |
| Carbon canary | The buyer's side of the record | The seller's side |

**Availability is never encoded by colour alone.** The seller's open hours, the
buyer's availability, and their overlap each carry a colour *and* a fill
pattern *and* a text label. The overlap is the product's whole idea; a
colour-blind buyer must be able to read it, and so must a screen reader.

### Typography

One family: **Archivo**, 400/500/600/700, with `font-variant-numeric:
tabular-nums` everywhere a time or a price appears — a ledger's columns must
align. Fixed rem scale at a 1.2 ratio; no fluid clamps in product UI. Column
heads are letterspaced uppercase at 0.72rem. No second display face: the
engraved feel comes from rules and letterspacing, not from another font.

### Rules over borders

The ruled line is this system's structural element. Prefer a 1px feint rule to
a box; prefer a red margin rule to a coloured left border on a card; prefer
hatching to a tint fill. Cards are used only where a thing is genuinely a
detached slip of paper — the carbon duplicate — and never nested.

### Motion

One authored moment: the landing's two availability bands sliding into
register, once, on load. Inside the product, the second is functional — booking
prints a carbon duplicate slip, which is the state change made visible.
Everything else is a 150–250ms state transition. No page-load choreography on
the seller or buyer surfaces; those load into a task.

### Density and states

Operate rules apply on `/seller` and `/search`: familiar affordances, standard
form controls, tabular density where a seller is scanning their week. Every
interactive element ships default, hover, focus-visible, active, disabled,
loading, and error. Empty states teach the interface — an empty book says what
a window is and offers to add one, rather than "no listings."

### Accessibility floor

- Every slot names its weekday, date, time, and timezone in text.
- The availability grid is keyboard-operable: arrow keys move, space toggles,
  shift+arrow extends. It is a two-dimensional control and a pointer is not
  assumed.
- Focus-visible is a 2px stamp-violet ring at a 2px offset, on every surface.
- Contrast: body ≥4.5:1, large text ≥3:1, verified in both books.
