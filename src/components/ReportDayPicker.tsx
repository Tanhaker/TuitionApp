"use client";

import { useRouter } from "next/navigation";
import { prettyDate, shiftDate, todayISO } from "@/lib/dates";

/**
 * Date strip for the single-day report — same shape as the one on Today, so
 * stepping through days feels identical on both screens.
 */
export default function ReportDayPicker({
  on,
  scope,
  by,
}: {
  on: string;
  scope: string;
  by: string;
}) {
  const router = useRouter();
  const today = todayISO();

  function go(date: string) {
    router.push(`/reports?on=${date}&scope=${scope}&by=${by}`);
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
        aria-label="Report date"
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
