"use client";

import { useCallback, useRef, useState } from "react";
import { DAY_LABELS, type RecurringRule } from "@/lib/scheduling";

/**
 * The buyer's week, as a grid they can actually operate.
 *
 * A grid is a two-dimensional control and a pointer cannot be assumed, so this
 * implements the roving-tabindex pattern: one tab stop for the whole grid,
 * arrows to move, space to toggle, shift+arrow to paint a run. Someone filling
 * in "weekday evenings" with a keyboard should not need thirty-five tab
 * presses to do it.
 *
 * The parse from the natural-language box writes into this same state, so the
 * model's output is always visible and always correctable before it is used.
 */

const FIRST_HOUR = 6;
const LAST_HOUR = 22; // exclusive
const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);

export type Selection = Set<string>; // `${day}:${hour}`

export function key(day: number, hour: number): string {
  return `${day}:${hour}`;
}

/** Grid cells -> the engine's rules, merging each day's contiguous runs. */
export function selectionToRules(selection: Selection): RecurringRule[] {
  const rules: RecurringRule[] = [];

  for (let day = 0; day < 7; day += 1) {
    let runStart: number | null = null;
    for (const hour of [...HOURS, LAST_HOUR]) {
      const on = hour < LAST_HOUR && selection.has(key(day, hour));
      if (on && runStart === null) runStart = hour;
      if (!on && runStart !== null) {
        rules.push({
          dayOfWeek: day as RecurringRule["dayOfWeek"],
          startMinute: runStart * 60,
          endMinute: hour * 60,
        });
        runStart = null;
      }
    }
  }
  return rules;
}

/** The inverse, for showing a parsed result back in the grid. */
export function rulesToSelection(rules: RecurringRule[]): Selection {
  const selection: Selection = new Set();
  for (const rule of rules) {
    const from = Math.max(FIRST_HOUR, Math.floor(rule.startMinute / 60));
    const to = Math.min(LAST_HOUR, Math.ceil(rule.endMinute / 60));
    for (let hour = from; hour < to; hour += 1) selection.add(key(rule.dayOfWeek, hour));
  }
  return selection;
}

function clock(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}${suffix}`;
}

export function AvailabilityGrid({
  selection,
  onChange,
  tone = "buyer",
  label = "Hours you are free, each week",
}: {
  selection: Selection;
  onChange: (next: Selection) => void;
  /** Which side of the match this grid belongs to. Same control, same keys. */
  tone?: "buyer" | "seller";
  label?: string;
}) {
  const band = tone === "seller" ? "--seller-band" : "--buyer-band";
  const bandSoft = tone === "seller" ? "--seller-band-soft" : "--buyer-band-soft";
  const hatch = tone === "seller" ? "hatch-seller" : "hatch-buyer";
  const [focus, setFocus] = useState({ day: 6, hour: 10 });
  const gridRef = useRef<HTMLDivElement>(null);

  const setCell = useCallback(
    (day: number, hour: number, on: boolean) => {
      const next = new Set(selection);
      if (on) next.add(key(day, hour));
      else next.delete(key(day, hour));
      onChange(next);
    },
    [selection, onChange],
  );

  const toggle = useCallback(
    (day: number, hour: number) => setCell(day, hour, !selection.has(key(day, hour))),
    [selection, setCell],
  );

  function move(day: number, hour: number, extend: boolean) {
    const nextDay = Math.min(6, Math.max(0, day));
    const nextHour = Math.min(LAST_HOUR - 1, Math.max(FIRST_HOUR, hour));
    setFocus({ day: nextDay, hour: nextHour });
    // Shift+arrow paints as it moves, so a run is one gesture rather than one
    // press per hour.
    if (extend) setCell(nextDay, nextHour, true);
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-cell="${key(nextDay, nextHour)}"]`)
      ?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, day: number, hour: number) {
    const extend = event.shiftKey;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        move(day, hour - 1, extend);
        break;
      case "ArrowRight":
        event.preventDefault();
        move(day, hour + 1, extend);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(day - 1, hour, extend);
        break;
      case "ArrowDown":
        event.preventDefault();
        move(day + 1, hour, extend);
        break;
      case "Home":
        event.preventDefault();
        move(day, FIRST_HOUR, extend);
        break;
      case "End":
        event.preventDefault();
        move(day, LAST_HOUR - 1, extend);
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        toggle(day, hour);
        break;
      default:
        break;
    }
  }

  return (
    <div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={label}
        className="w-full overflow-x-auto"
      >
        <div role="row" className="flex gap-px pl-9">
          {HOURS.map((hour) => (
            <div
              key={hour}
              role="columnheader"
              className="colhead min-w-4 flex-1 text-center text-[0.5625rem] tracking-[0.06em]"
            >
              {hour % 3 === 0 ? clock(hour) : ""}
            </div>
          ))}
        </div>

        {DAY_LABELS.map((dayLabel, day) => (
          <div role="row" key={dayLabel} className="flex items-center gap-px">
            <div role="rowheader" className="colhead w-9 shrink-0 text-[0.625rem]">
              {dayLabel.slice(0, 3)}
            </div>
            {HOURS.map((hour) => {
              const on = selection.has(key(day, hour));
              const isFocus = focus.day === day && focus.hour === hour;
              return (
                <button
                  key={hour}
                  type="button"
                  role="gridcell"
                  data-cell={key(day, hour)}
                  aria-selected={on}
                  aria-label={`${dayLabel} ${clock(hour)} to ${clock(hour + 1)}`}
                  tabIndex={isFocus ? 0 : -1}
                  onFocus={() => setFocus({ day, hour })}
                  onClick={() => toggle(day, hour)}
                  onKeyDown={(e) => onKeyDown(e, day, hour)}
                  className={`${hatch} h-6 min-w-4 flex-1 rounded-[1px] transition-colors duration-150 ${
                    on ? "" : "bg-transparent"
                  }`}
                  style={{
                    backgroundColor: on ? `var(${bandSoft})` : undefined,
                    backgroundImage: on ? undefined : "none",
                    boxShadow: `inset 0 0 0 1px var(${on ? band : "--rule"})`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <p className="mt-2 text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
        Click an hour, or use the arrow keys and space. Hold shift while moving
        to fill a run.
      </p>
    </div>
  );
}
