"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { setLessonNote, toggleLesson } from "@/app/actions";
import { daysBetween, prettyDate, shiftDate, todayISO } from "@/lib/dates";
import type { Student } from "@/lib/types";
import { gradeLabel } from "@/lib/grades";

export type ChipData = {
  id: string;
  name: string;
  on: boolean;
  lastTaught: string | null;
  examDate: string | null;
  /** The chapter recorded against today's lesson, once one is logged. */
  note: string | null;
  /** The chapter from the previous time this subject was taught. */
  lastNote: string | null;
};

export type RowData = {
  student: Student;
  subjects: ChipData[];
  alsoToday: string[];
};

/**
 * A short buzz to confirm a tap landed.
 *
 * This app is used one-handed in a noisy room, often without looking straight
 * at the screen. A 12ms pulse says "that saved" without the teacher having to
 * check. Silently absent on iOS Safari, which does not implement vibrate — so
 * it is a bonus, never the only confirmation.
 */
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Some browsers throw if the page is not visible. Nothing depends on this.
  }
}

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

  // Chapters. Logging stays one tap: recording what was covered is a separate,
  // optional action, so a teacher in a hurry is never held up by a text field.
  const [noteFlip, setNoteFlip] = useState<Record<string, string | null>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

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
        buzz([40, 60, 40]);
        setError(res.error);
        return;
      }
      buzz(res.on ? 12 : [8, 40, 8]);
      setFlip((f) => ({ ...f, [key]: res.on }));
      if (!res.on) {
        // The lesson is gone, so its chapter went with it. Drop any local copy
        // and close the editor if it was open on this subject.
        setNoteFlip((n) => ({ ...n, [key]: null }));
        setEditing((e) => (e === key ? null : e));
      }
      startTransition(() => router.refresh());
    } catch {
      // Only transport failures reach here now — the action returns its own
      // errors as values. Anything thrown means the request never completed.
      revert();
      buzz([40, 60, 40]);
      setError("Could not save. Check your connection and tap again.");
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  }

  async function saveNote(studentId: string, subjectId: string) {
    const key = `${studentId}|${subjectId}`;
    const text = draft.trim();
    setSavingNote(true);
    setError(null);
    try {
      const res = await setLessonNote(studentId, subjectId, date, text);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNoteFlip((n) => ({ ...n, [key]: res.note }));
      setEditing(null);
      setDraft("");
      startTransition(() => router.refresh());
    } catch {
      setError("Could not save that chapter. Check your connection and try again.");
    } finally {
      setSavingNote(false);
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
                <span className="grade">{gradeLabel(row.student.grade)}</span>
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

              {/* Chapters, for subjects logged today only. */}
              {(() => {
                const logged = row.subjects.filter(
                  (sub) => flip[`${row.student.id}|${sub.id}`] ?? sub.on
                );
                if (logged.length === 0) return null;

                return (
                  <div className="chapters">
                    {logged.map((sub) => {
                      const key = `${row.student.id}|${sub.id}`;
                      const text = noteFlip[key] !== undefined ? noteFlip[key] : sub.note;

                      if (editing === key) {
                        return (
                          <form
                            className="chapter-edit"
                            key={sub.id}
                            onSubmit={(e) => {
                              e.preventDefault();
                              saveNote(row.student.id, sub.id);
                            }}
                          >
                            <label className="eyebrow" htmlFor={`ch-${key}`}>
                              {sub.name} — chapter or topic
                            </label>
                            <input
                              id={`ch-${key}`}
                              autoFocus
                              value={draft}
                              maxLength={120}
                              disabled={savingNote}
                              onChange={(e) => setDraft(e.target.value)}
                              placeholder={
                                sub.lastNote ? `last time: ${sub.lastNote}` : "e.g. Ch 4 Fractions"
                              }
                            />
                            <div className="between" style={{ gap: 6 }}>
                              <button className="btn" style={{ flex: 1 }} disabled={savingNote}>
                                {savingNote ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="btn ghost"
                                style={{ flex: 1 }}
                                disabled={savingNote}
                                onClick={() => {
                                  setEditing(null);
                                  setDraft("");
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                            {sub.lastNote && (
                              <p className="hint">
                                Last time: <span className="mono">{sub.lastNote}</span>
                              </p>
                            )}
                          </form>
                        );
                      }

                      return (
                        <button
                          key={sub.id}
                          className="chapter"
                          data-empty={text ? undefined : "true"}
                          onClick={() => {
                            setEditing(key);
                            setDraft(text ?? "");
                          }}
                        >
                          <span className="subj">{sub.name}</span>
                          <span className="what">{text || "add chapter"}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </article>
          ))}
        </div>
      )}

      <p className="hint" style={{ marginTop: 14 }}>
        Tap a subject to log it, tap again to undo. The small number is days since
        you last taught that subject to that student — or days to their exam once
        one is near. Once a subject is logged you can add the chapter you covered;
        it shows up in Reports and in the CSV export.
      </p>
    </>
  );
}
