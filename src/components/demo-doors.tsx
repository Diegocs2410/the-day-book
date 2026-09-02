"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * The two doors.
 *
 * A reviewer should be inside the product in one click, not filling in a
 * sign-up form. Both accounts are seeded, and the page says so plainly rather
 * than letting anyone think this is their data.
 */
export function DemoDoors() {
  const router = useRouter();
  const [pending, setPending] = useState<"seller" | "buyer" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enter(role: "seller" | "buyer") {
    setPending(role);
    setError(null);
    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Could not open the demo.");
        setPending(null);
        return;
      }
      router.push(body.redirectTo);
      router.refresh();
    } catch {
      setError("Could not reach the server. Is it running?");
      setPending(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => enter("seller")} loading={pending === "seller"}>
          Keep a book
          <span className="font-normal opacity-70">— sell</span>
        </Button>
        <Button variant="quiet" onClick={() => enter("buyer")} loading={pending === "buyer"}>
          Find a slot
          <span className="font-normal opacity-70">— buy</span>
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-[0.8125rem]" style={{ color: "var(--margin-rule)" }}>
          {error}
        </p>
      )}

      <p className="mt-3 text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
        Both doors sign you into a seeded demo account. Every listing, address
        and price in here is invented.
      </p>
    </div>
  );
}
