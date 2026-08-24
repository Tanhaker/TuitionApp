"use client";

import { useRouter } from "next/navigation";
import { prettyDate, shiftDate, todayISO } from "@/lib/dates";

/**
 * Step a screen back and forward one day at a time.
 *
 * Shared by the single-day report and the day board so both feel identical —
 * a teacher who has learnt the arrows on one screen has learnt them on both.
 * The destination is passed as a path plus plain params rather than a callback,
 * because a server component cannot hand a function to a client one.
 *
 * Capped at today: there is nothing to read from the future.
 */
export default function DayStrip({
  on,
  basePath,
  params,
  label = "Date",
}: {
  on: string;
  basePath: string;
  params?: Record<string, string>;
  label?: string;
}) {
  const router = useRouter();
  const today = todayISO();

  function go(date: string) {
    const q = new URLSearchParams({ ...(params ?? {}), on: date });
    router.push(`${basePath}?${q.toString()}`);
  }

  return (
    <div className="datestrip">
      <button className="stepper" aria-label="Previous day" onClick={() => go(shiftDate(on, -1))}>
        ‹
      </button>
      <input
        type="date"
        value={on}
        max={today}
        aria-label={label}
        onChange={(e) => e.target.value && go(e.target.value)}
      />
      <button
        className="stepper"
        aria-label="Next day"
        disabled={on >= today}
        onClick={() => go(shiftDate(on, 1))}
      >
        ›
      </button>
      <span className="eyebrow" style={{ flexShrink: 0 }}>
        {on === today ? "today" : prettyDate(on)}
      </span>
    </div>
  );
}
