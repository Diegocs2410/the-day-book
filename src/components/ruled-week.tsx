import { DAY_LABELS, type RecurringRule } from "@/lib/scheduling";

/**
 * A week, ruled.
 *
 * One row per day, time running left to right — a ledger's page, not a
 * calendar's grid. Two people's availability lie on the same rule so the
 * overlap is where they physically coincide, which is the product's entire
 * idea drawn rather than described.
 *
 * The overlap carries three signals at once: colour, a cross-hatch, and text
 * in the row's own label. Any one of them alone would fail somebody.
 */

const DAY_START = 6 * 60; // 06:00 — earlier than this, nobody is viewing a house
const DAY_END = 22 * 60;
const SPAN = DAY_END - DAY_START;

function percent(minute: number): number {
  return ((Math.min(Math.max(minute, DAY_START), DAY_END) - DAY_START) / SPAN) * 100;
}

interface Band {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

function bandsFor(rules: Band[], day: number) {
  return rules.filter((r) => r.dayOfWeek === day && r.endMinute > DAY_START);
}

/** Where two sets of rules coincide, per day. Mirrors the engine, in minutes. */
function overlapFor(a: Band[], b: Band[], day: number): Band[] {
  const left = bandsFor(a, day);
  const right = bandsFor(b, day);
  const out: Band[] = [];
  for (const l of left) {
    for (const r of right) {
      const startMinute = Math.max(l.startMinute, r.startMinute);
      const endMinute = Math.min(l.endMinute, r.endMinute);
      if (endMinute > startMinute) out.push({ dayOfWeek: day, startMinute, endMinute });
    }
  }
  return out;
}

function clock(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, "0")}${suffix}`;
}

export interface RuledWeekProps {
  seller: RecurringRule[];
  buyer?: RecurringRule[];
  /** Adds the entrance animation. Used once, on the landing page. */
  animate?: boolean;
  sellerLabel?: string;
  buyerLabel?: string;
}

export function RuledWeek({
  seller,
  buyer = [],
  animate = false,
  sellerLabel = "House open",
  buyerLabel = "You are free",
}: RuledWeekProps) {
  const hours = [6, 9, 12, 15, 18, 21];

  return (
    <div className="w-full">
      {/* Hour heads, in the ledger's column-head vocabulary. */}
      <div className="relative mb-1 ml-11 h-4">
        {hours.map((h) => (
          <span
            key={h}
            className="colhead absolute -translate-x-1/2"
            style={{ left: `${percent(h * 60)}%` }}
          >
            {clock(h * 60)}
          </span>
        ))}
      </div>

      <div className="ledger-margin">
        {DAY_LABELS.map((label, day) => {
          const sellerBands = bandsFor(seller, day);
          const buyerBands = bandsFor(buyer, day);
          const both = overlapFor(seller, buyer, day);

          return (
            <div key={label} className="flex items-stretch gap-2">
              <span
                className="colhead flex w-8 shrink-0 items-center"
                style={{ height: "var(--rule-step)" }}
              >
                {label.slice(0, 3)}
              </span>

              <div
                className="relative flex-1 border-b"
                style={{
                  height: "var(--rule-step)",
                  borderColor: "var(--rule)",
                }}
              >
                {/* Seller's open hours. */}
                {sellerBands.map((b, i) => (
                  <span
                    key={`s${i}`}
                    className="hatch-seller absolute top-1.5 h-2.5 rounded-[1px]"
                    style={{
                      left: `${percent(b.startMinute)}%`,
                      width: `${percent(b.endMinute) - percent(b.startMinute)}%`,
                      backgroundColor: "var(--seller-band-soft)",
                      animation: animate
                        ? "band-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both"
                        : undefined,
                      animationDelay: animate ? `${day * 45}ms` : undefined,
                    }}
                  />
                ))}

                {/* Buyer's availability, laid over the same rule. */}
                {buyerBands.map((b, i) => (
                  <span
                    key={`b${i}`}
                    className="hatch-buyer absolute bottom-1.5 h-2.5 rounded-[1px]"
                    style={{
                      left: `${percent(b.startMinute)}%`,
                      width: `${percent(b.endMinute) - percent(b.startMinute)}%`,
                      backgroundColor: "var(--buyer-band-soft)",
                      animation: animate
                        ? "band-in 700ms cubic-bezier(0.16, 1, 0.3, 1) both"
                        : undefined,
                      animationDelay: animate ? `${300 + day * 45}ms` : undefined,
                    }}
                  />
                ))}

                {/* Where they coincide — the answer. */}
                {both.map((b, i) => (
                  <span
                    key={`o${i}`}
                    className="hatch-both absolute inset-y-1 rounded-[1px] ring-1"
                    style={{
                      left: `${percent(b.startMinute)}%`,
                      width: `${percent(b.endMinute) - percent(b.startMinute)}%`,
                      // @ts-expect-error CSS custom property on ring colour
                      "--tw-ring-color": "var(--stamp)",
                      animation: animate
                        ? "overlap-in 500ms cubic-bezier(0.16, 1, 0.3, 1) both"
                        : undefined,
                      animationDelay: animate ? `${900 + day * 45}ms` : undefined,
                    }}
                  />
                ))}
              </div>

              {/* The text channel. Never colour alone. */}
              <span
                className="tabular w-32 shrink-0 self-center text-right text-[0.6875rem]"
                style={{ color: both.length > 0 ? "var(--stamp)" : "var(--text-faint)" }}
              >
                {both.length > 0
                  ? both.map((b) => `${clock(b.startMinute)}–${clock(b.endMinute)}`).join(", ")
                  : sellerBands.length > 0
                    ? "no overlap"
                    : "closed"}
              </span>
            </div>
          );
        })}
      </div>

      <Legend sellerLabel={sellerLabel} buyerLabel={buyerLabel} showBuyer={buyer.length > 0} />
    </div>
  );
}

function Legend({
  sellerLabel,
  buyerLabel,
  showBuyer,
}: {
  sellerLabel: string;
  buyerLabel: string;
  showBuyer: boolean;
}) {
  return (
    <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 pl-11">
      <LegendItem className="hatch-seller" fill="var(--seller-band-soft)" label={sellerLabel} />
      {showBuyer && (
        <LegendItem className="hatch-buyer" fill="var(--buyer-band-soft)" label={buyerLabel} />
      )}
      {showBuyer && (
        <LegendItem
          className="hatch-both ring-1"
          fill="transparent"
          label="Both — bookable"
          stamped
        />
      )}
    </ul>
  );
}

function LegendItem({
  className,
  fill,
  label,
  stamped = false,
}: {
  className: string;
  fill: string;
  label: string;
  stamped?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 text-[0.75rem]" style={{ color: "var(--text-soft)" }}>
      <span
        className={`h-3 w-7 rounded-[1px] ${className}`}
        style={
          stamped
            ? ({ backgroundColor: fill, "--tw-ring-color": "var(--stamp)" } as React.CSSProperties)
            : { backgroundColor: fill }
        }
        aria-hidden
      />
      {label}
    </li>
  );
}
