"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toggleLesson } from "@/app/actions";
import { daysBetween, prettyDate, shiftDate, todayISO } from "@/lib/dates";
import type { Student } from "@/lib/types";

export type ChipData = {
  id: string;
  name: string;
  on: boolean;
  lastTaught: string | null;
  examDate: string | null;
};

export type RowData = {
  student: Student;
  subjects: ChipData[];
  alsoToday: string[];
};

export default function LogGrid({
  rows,
  date,
  scope,
}: {
  rows: RowData[];
  date: string;
  scope: "mine" | "all";
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // local overrides so a tap feels instant even on a slow connection
  const [flip, setFlip] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const today = todayISO();

  function go(next: Partial<{ date: string; scope: string }>) {
    const params = new URLSearchParams({ date, scope, ...next });
    router.push(`/?${params.toString()}`);
  }

  async function tap(studentId: string, subjectId: string, currentlyOn: boolean) {
    const key = `${studentId}|${subjectId}`;
    setFlip((f) => ({ ...f, [key]: !currentlyOn }));
    setPending((p) => ({ ...p, [key]: true }));
    setError(null);
    // Drop the optimistic override so the chip falls back to the server's value.
    const revert = () =>
      setFlip((f) => {
        const copy = { ...f };
        delete copy[key];
        return copy;
      });

    try {
      const res = await toggleLesson(studentId, subjectId, date);
      if (!res.ok) {
        revert();
        setError(res.error);
        return;
      }
      setFlip((f) => ({ ...f, [key]: res.on }));
      startTransition(() => router.refresh());
    } catch {
      // Only transport failures reach here now — the action returns its own
      // errors as values. Anything thrown means the request never completed.
      revert();
      setError("Could not save. Check your connection and tap again.");
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  }

  const loggedCount = useMemo(
    () =>
      rows.reduce(
        (n, r) =>
          n +
          r.subjects.filter((s) => flip[`${r.student.id}|${s.id}`] ?? s.on).length,
        0
      ),
    [rows, flip]
  );

  return (
    <>
      <div className="datestrip">
        <button className="stepper" aria-label="Previous day" onClick={() => go({ date: shiftDate(date, -1) })}>
          ‹
        </button>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && go({ date: e.target.value })}
          aria-label="Date"
        />
        <button
          className="stepper"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => go({ date: shiftDate(date, 1) })}
        >
          ›
        </button>
      </div>

      <div className="between" style={{ marginBottom: 8 }}>
        <span className="eyebrow">
          {prettyDate(date)} · {loggedCount} logged
        </span>
        <div className="tabs" style={{ margin: 0, width: 200 }}>
          <button data-active={scope === "mine"} onClick={() => go({ scope: "mine" })}>
            My students
          </button>
          <button data-active={scope === "all"} onClick={() => go({ scope: "all" })}>
            Everyone
          </button>
        </div>
      </div>

      {error && <p className="err">{error}</p>}

      {rows.length === 0 ? (
        <div className="empty">No students to show for this view.</div>
      ) : (
        <div className="register">
          {rows.map((row) => (
            <article className="row" key={row.student.id}>
              <header>
                <span className="name">{row.student.name}</span>
                <span className="grade">Class {row.student.grade}</span>
                {row.alsoToday.length > 0 && (
                  <span className="meta">also: {row.alsoToday.join(", ")}</span>
                )}
              </header>
              <div className="chips">
                {row.subjects.map((sub) => {
                  const key = `${row.student.id}|${sub.id}`;
                  const on = flip[key] ?? sub.on;
                  const gap = sub.lastTaught ? daysBetween(sub.lastTaught, date) : null;
                  const toExam = sub.examDate ? daysBetween(date, sub.examDate) : null;
                  const due =
                    toExam !== null && toExam <= 7
                      ? "urgent"
                      : toExam !== null && toExam <= 21
                        ? "soon"
                        : undefined;

                  return (
                    <button
                      key={sub.id}
                      className="chip"
                      data-on={on}
                      data-due={due}
                      data-pending={pending[key] ? "true" : undefined}
                      onClick={() => tap(row.student.id, sub.id, on)}
                      aria-pressed={on}
                    >
                      {sub.name}
                      {!on && (
                        <span className="days">
                          {toExam !== null
                            ? `exam ${toExam}d`
                            : gap === null
                              ? "never"
                              : `${gap}d`}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="hint" style={{ marginTop: 14 }}>
        Tap a subject to log it, tap again to undo. The small number is days since
        you last taught that subject to that student — or days to their exam once
        one is near.
      </p>
    </>
  );
}
