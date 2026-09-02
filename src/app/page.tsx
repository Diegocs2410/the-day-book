import Link from "next/link";
import { DemoDoors } from "@/components/demo-doors";
import { RuledWeek } from "@/components/ruled-week";
import type { RecurringRule } from "@/lib/scheduling";

/**
 * The landing page.
 *
 * The first viewport is a thesis, not a header: two people's weeks slide onto
 * the same rule and the overlap resolves in front of the visitor. The claim
 * "we match your availability" is never made in words up there, because the
 * page can simply do it.
 */

// A plausible week, authored as demonstration material. Nothing here is a real
// listing, and the page says so where it could be mistaken for one.
const sellerWeek: RecurringRule[] = [
  { dayOfWeek: 0, startMinute: 12 * 60, endMinute: 16 * 60 },
  { dayOfWeek: 3, startMinute: 17 * 60, endMinute: 20 * 60 },
  { dayOfWeek: 4, startMinute: 17 * 60, endMinute: 19 * 60 },
  { dayOfWeek: 6, startMinute: 10 * 60, endMinute: 14 * 60 },
];

const buyerWeek: RecurringRule[] = [
  { dayOfWeek: 1, startMinute: 18 * 60, endMinute: 21 * 60 },
  { dayOfWeek: 3, startMinute: 18 * 60, endMinute: 21 * 60 },
  { dayOfWeek: 4, startMinute: 18 * 60, endMinute: 22 * 60 },
  { dayOfWeek: 6, startMinute: 8 * 60, endMinute: 12 * 60 },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-[68rem] px-5 pb-24 pt-10 sm:px-8">
      <header className="flex items-baseline justify-between gap-4 border-b pb-3" style={{ borderColor: "var(--rule-strong)" }}>
        <span className="colhead">The Day Book</span>
        <span className="colhead">Showing register</span>
      </header>

      <section className="ledger-margin pt-10">
        <h1 className="max-w-[20ch] text-[2rem] font-bold leading-[1.1] tracking-[-0.03em] sm:text-[2.75rem]">
          Two weeks, laid on the same rule.
        </h1>
        <p className="mt-4 max-w-[58ch] text-[1rem]" style={{ color: "var(--text-soft)" }}>
          A seller writes down the hours their house can be seen. A buyer writes
          down the hours they are free. What is left is the only thing either of
          them can act on.
        </p>
      </section>

      <section className="mt-10" aria-label="How the match is made">
        <RuledWeek seller={sellerWeek} buyer={buyerWeek} animate />
      </section>

      <section className="mt-10 border-t pt-8" style={{ borderColor: "var(--rule-strong)" }}>
        <div className="ledger-margin">
          <DemoDoors />
        </div>
      </section>

      <section className="mt-16 grid gap-x-10 gap-y-8 border-t pt-8 sm:grid-cols-3" style={{ borderColor: "var(--rule-strong)" }}>
        <Note head="The house keeps the clock">
          Showing hours are wall-clock time in the property&rsquo;s own timezone,
          not the seller&rsquo;s browser. A Denver house open at 10 is open at 10
          in March and in July, and a buyer in New York is told it is noon for
          them.
        </Note>
        <Note head="An offer you can take">
          A slot is only shown once the turnaround gap around existing showings
          has been taken out of it. Nothing is offered that would be refused a
          second later.
        </Note>
        <Note head="One doorstep, one buyer">
          Two people pressing Book at the same moment is settled in the database
          by an exclusion constraint, not by an application check that a race can
          slip past. The second one is told the truth.
        </Note>
      </section>

      <footer className="mt-16 border-t pt-4 text-[0.75rem]" style={{ borderColor: "var(--rule)", color: "var(--text-faint)" }}>
        <p>
          A one-day build. Every listing, address, price and photograph in the
          demo is synthetic.{" "}
          <Link href="/search" className="underline underline-offset-2">
            Browse without an account
          </Link>
          .
        </p>
      </footer>
    </main>
  );
}

function Note({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="colhead mb-2 border-b pb-1.5" style={{ borderColor: "var(--rule)" }}>
        {head}
      </h2>
      <p className="text-[0.8125rem] leading-[1.6]" style={{ color: "var(--text-soft)" }}>
        {children}
      </p>
    </div>
  );
}
