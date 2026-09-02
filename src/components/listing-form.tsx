"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AvailabilityGrid,
  selectionToRules,
  type Selection,
} from "@/components/availability-grid";
import { Button, Field, Input } from "@/components/ui";
import { SCHEDULE_PARAM_RULES, validateScheduleParams } from "@/lib/scheduling";

/**
 * Open a new page in the book.
 *
 * The same grid the buyer uses, in the seller's colour. One control, learned
 * once — a seller who later browses as a buyer already knows how it works.
 *
 * The timezone defaults to the browser's, and says so: it is the property's
 * clock that matters, and a seller listing a house in another state has to be
 * told to change it rather than silently getting it wrong.
 */

const ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function ListingForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [windows, setWindows] = useState<Selection>(new Set());

  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [form, setForm] = useState({
    address: "",
    city: "",
    state: "",
    timezone: ZONES.includes(browserZone) ? browserZone : "America/New_York",
    price: "",
    bedrooms: "3",
    bathrooms: "2",
    squareFeet: "",
    description: "",
    slotMinutes: "30",
    bufferMinutes: "15",
    bookingWindowDays: "14",
    minNoticeMinutes: "120",
  });

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const rules = selectionToRules(windows);
    if (rules.length === 0) {
      setError("Mark at least one hour the house can be seen — that is the whole listing.");
      return;
    }

    // The same bounds the database enforces, so the message arrives before the
    // round trip rather than as a constraint violation afterwards.
    const scheduleErrors = validateScheduleParams({
      slotMinutes: Number(form.slotMinutes),
      bufferMinutes: Number(form.bufferMinutes),
      bookingWindowDays: Number(form.bookingWindowDays),
      minNoticeMinutes: Number(form.minNoticeMinutes),
    });
    if (Object.keys(scheduleErrors).length > 0) {
      setFieldErrors(scheduleErrors as Record<string, string>);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.address,
          city: form.city,
          state: form.state.toUpperCase(),
          timezone: form.timezone,
          priceCents: Math.round(Number(form.price) * 100),
          bedrooms: Number(form.bedrooms),
          bathrooms: Number(form.bathrooms),
          squareFeet: Number(form.squareFeet),
          description: form.description,
          photoUrl: null,
          slotMinutes: Number(form.slotMinutes),
          bufferMinutes: Number(form.bufferMinutes),
          bookingWindowDays: Number(form.bookingWindowDays),
          minNoticeMinutes: Number(form.minNoticeMinutes),
          windows: rules,
          blackoutDates: [],
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Could not save the listing.");
        return;
      }

      setWindows(new Set());
      setForm((f) => ({ ...f, address: "", city: "", price: "", squareFeet: "", description: "" }));
      router.refresh();
      onDone?.();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="ledger-margin">
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Address">
            <Input
              required
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="418 Rimrock Court"
            />
          </Field>
        </div>

        <Field label="City">
          <Input required value={form.city} onChange={(e) => set("city", e.target.value)} />
        </Field>

        <Field label="State">
          <Input
            required
            maxLength={2}
            value={form.state}
            onChange={(e) => set("state", e.target.value.toUpperCase())}
            placeholder="CO"
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="The house's timezone"
            hint="A showing happens at the property, so this is the clock the hours below are kept in — not yours."
          >
            <select
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
              className="w-full border-0 border-b bg-transparent px-1 py-1.5 text-[0.875rem] text-[var(--text)] outline-none"
              style={{ borderBottomWidth: 1, borderColor: "var(--rule-strong)" }}
            >
              {ZONES.map((zone) => (
                <option key={zone} value={zone} style={{ color: "#111" }}>
                  {zone.split("/")[1].replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Price (USD)">
          <Input
            required
            type="number"
            min={0}
            step={1000}
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="740000"
          />
        </Field>

        <Field label="Square feet">
          <Input
            required
            type="number"
            min={1}
            value={form.squareFeet}
            onChange={(e) => set("squareFeet", e.target.value)}
            placeholder="1840"
          />
        </Field>

        <Field label="Bedrooms">
          <Input
            required
            type="number"
            min={0}
            max={20}
            value={form.bedrooms}
            onChange={(e) => set("bedrooms", e.target.value)}
          />
        </Field>

        <Field label="Bathrooms">
          <Input
            required
            type="number"
            min={0}
            max={20}
            step={0.5}
            value={form.bathrooms}
            onChange={(e) => set("bathrooms", e.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="South-facing, walk to the light rail."
            />
          </Field>
        </div>
      </div>

      <fieldset className="mt-8 border-0 p-0">
        <legend className="colhead mb-3">Showing settings</legend>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-4">
          <Field
            label="Each showing"
            error={fieldErrors.slotMinutes}
            hint={fieldErrors.slotMinutes ? undefined : "minutes"}
          >
            <Input
              type="number"
              min={SCHEDULE_PARAM_RULES.slotMinutes.min}
              max={SCHEDULE_PARAM_RULES.slotMinutes.max}
              value={form.slotMinutes}
              onChange={(e) => set("slotMinutes", e.target.value)}
            />
          </Field>
          <Field
            label="Gap between"
            error={fieldErrors.bufferMinutes}
            hint={fieldErrors.bufferMinutes ? undefined : "minutes to reset the house"}
          >
            <Input
              type="number"
              min={SCHEDULE_PARAM_RULES.bufferMinutes.min}
              max={SCHEDULE_PARAM_RULES.bufferMinutes.max}
              value={form.bufferMinutes}
              onChange={(e) => set("bufferMinutes", e.target.value)}
            />
          </Field>
          <Field
            label="Book ahead"
            error={fieldErrors.bookingWindowDays}
            hint={fieldErrors.bookingWindowDays ? undefined : "days"}
          >
            <Input
              type="number"
              min={SCHEDULE_PARAM_RULES.bookingWindowDays.min}
              max={SCHEDULE_PARAM_RULES.bookingWindowDays.max}
              value={form.bookingWindowDays}
              onChange={(e) => set("bookingWindowDays", e.target.value)}
            />
          </Field>
          <Field
            label="Notice"
            error={fieldErrors.minNoticeMinutes}
            hint={fieldErrors.minNoticeMinutes ? undefined : "minutes"}
          >
            <Input
              type="number"
              min={SCHEDULE_PARAM_RULES.minNoticeMinutes.min}
              max={SCHEDULE_PARAM_RULES.minNoticeMinutes.max}
              value={form.minNoticeMinutes}
              onChange={(e) => set("minNoticeMinutes", e.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-8 border-0 p-0">
        <legend className="colhead mb-3">
          Hours the house can be seen — {form.timezone.split("/")[1].replace("_", " ")} time
        </legend>
        <AvailabilityGrid
          selection={windows}
          onChange={setWindows}
          tone="seller"
          label="Hours the house can be seen, each week"
        />
      </fieldset>

      {error && (
        <p role="alert" className="mt-5 text-[0.8125rem]" style={{ color: "var(--margin-rule)" }}>
          {error}
        </p>
      )}

      <div className="mt-6">
        <Button type="submit" loading={saving}>
          Open the page
        </Button>
      </div>
    </form>
  );
}
