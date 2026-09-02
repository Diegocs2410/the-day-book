"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AvailabilityGrid,
  rulesToSelection,
  selectionToRules,
  type Selection,
} from "@/components/availability-grid";
import { Button } from "@/components/ui";
import { encodeAvailability } from "@/lib/availability-url";
import type { RecurringRule } from "@/lib/scheduling";

/**
 * The buyer's side of the match: describe your week, get the houses you can
 * actually reach.
 *
 * Two ways in, and the relationship between them is the point. The sentence
 * box is faster; the grid is authoritative. A parse fills the grid and shows
 * its own reading in words, so a wrong interpretation is visible before it
 * changes any search — the buyer confirms, the model never commits.
 */
export function AvailabilityPanel({ initial }: { initial: RecurringRule[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [selection, setSelection] = useState<Selection>(() => rulesToSelection(initial));
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "info"; message: string } | null>(
    null,
  );

  const rules = selectionToRules(selection);

  function search() {
    const next = new URLSearchParams(params.toString());
    const encoded = encodeAvailability(rules);
    if (encoded) next.set("a", encoded);
    else next.delete("a");
    startTransition(() => router.push(`/search?${next.toString()}`));
  }

  async function parse() {
    if (!text.trim()) return;
    setParsing(true);
    setNotice(null);
    setReading(null);

    try {
      const response = await fetch("/api/availability/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = await response.json();

      if (!response.ok) {
        setNotice({ tone: "error", message: body.error });
        return;
      }
      if (body.rules.length === 0) {
        setNotice({
          tone: "info",
          message: "Nothing in that looked like times. Set the hours below instead.",
        });
        return;
      }

      setSelection(rulesToSelection(body.rules));
      setReading(body.summary);
    } catch {
      setNotice({ tone: "error", message: "Could not reach the parser. Use the grid below." });
    } finally {
      setParsing(false);
    }
  }

  return (
    <div>
      <div className="ledger-margin">
        <label htmlFor="availability-text" className="colhead mb-1.5 block">
          When are you free?
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <input
            id="availability-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void parse();
              }
            }}
            placeholder="weekday evenings after 6, and Saturday mornings"
            maxLength={400}
            className="min-w-[16rem] flex-1 border-0 border-b bg-transparent px-1 py-1.5 text-[0.9375rem] outline-none transition-colors duration-150 placeholder:text-[var(--text-faint)] focus:border-[var(--stamp)]"
            style={{ borderBottomWidth: 1, borderColor: "var(--rule-strong)" }}
          />
          <Button variant="quiet" onClick={parse} loading={parsing} disabled={!text.trim()}>
            Read it
          </Button>
        </div>

        {reading && (
          <p className="mt-2 text-[0.8125rem]" style={{ color: "var(--text-soft)" }}>
            Read as: <span style={{ color: "var(--stamp)" }}>{reading}</span>. Correct it
            below if that is wrong.
          </p>
        )}
        {notice && (
          <p
            role={notice.tone === "error" ? "alert" : undefined}
            className="mt-2 text-[0.8125rem]"
            style={{
              color: notice.tone === "error" ? "var(--margin-rule)" : "var(--text-soft)",
            }}
          >
            {notice.message}
          </p>
        )}
      </div>

      <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--rule)" }}>
        <AvailabilityGrid selection={selection} onChange={setSelection} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={search} loading={pending} disabled={rules.length === 0}>
          Show what I can reach
        </Button>
        {selection.size > 0 && (
          <Button variant="quiet" onClick={() => setSelection(new Set())}>
            Clear the week
          </Button>
        )}
        <span className="text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
          {selection.size === 0
            ? "No hours set yet."
            : `${selection.size} hour${selection.size === 1 ? "" : "s"} across ${
                new Set([...selection].map((k) => k.split(":")[0])).size
              } day${new Set([...selection].map((k) => k.split(":")[0])).size === 1 ? "" : "s"}.`}
        </span>
      </div>
    </div>
  );
}
