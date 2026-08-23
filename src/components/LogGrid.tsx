"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  clearAttendanceFor,
  markAllPresent,
  setAttendance,
  setLessonNote,
  toggleLesson,
} from "@/app/actions";
import UndoToast from "@/components/UndoToast";
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
  /** true present, false absent, null not marked yet. */
  present: boolean | null;
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

  // Attendance, optimistic like the chips. undefined = no local override yet.
  const [attFlip, setAttFlip] = useState<Record<string, boolean | null>>({});
  const [attBusy, setAttBusy] = useState(false);

  // A short-lived offer to reverse the last write. The write is never delayed
  // or confirmed first — this appears afterwards and expires on its own.
  const [undo, setUndo] = useState<{ message: string; run: () => Promise<void> } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function offerUndo(message: string, run: () => Promise<void>) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ message, run });
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  }

  function clearUndo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
  }

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const today = todayISO();

  function go(next: Partial<{ date: string; scope: string }>) {
    const params = new URLSearchParams({ date, scope, ...next });
    router.push(`/?${params.toString()}`);
  }

  async function tap(
    studentId: string,
    subjectId: string,
    currentlyOn: boolean,
    subjectName: string,
    studentName: string,
    existingNote: string | null
  ) {
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

      if (res.on) {
        offerUndo(`Logged ${subjectName} for ${studentName}.`, async () => {
          await toggleLesson(studentId, subjectId, date);
        });
      } else {
        // Un-logging deleted the row AND the chapter with it, so the reversal
        // has to put the chapter back or the undo quietly loses work.
        offerUndo(`Removed ${subjectName} for ${studentName}.`, async () => {
          const back = await toggleLesson(studentId, subjectId, date);
          if (back.ok && back.on && existingNote) {
            await setLessonNote(studentId, subjectId, date, existingNote);
            setNoteFlip((n) => ({ ...n, [key]: existingNote }));
          }
        });
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

  /** Cycle: not marked -> present -> absent -> not marked. */
  async function cycleAttendance(studentId: string, current: boolean | null) {
    const next = current === null ? true : current ? false : null;
    setAttFlip((a) => ({ ...a, [studentId]: next }));
    setError(null);
    try {
      const res = await setAttendance(studentId, date, next);
      if (!res.ok) {
        setAttFlip((a) => {
          const copy = { ...a };
          delete copy[studentId];
          return copy;
        });
        buzz([40, 60, 40]);
        setError(res.error);
        return;
      }
      buzz(next === null ? [8, 40, 8] : 12);
      startTransition(() => router.refresh());
    } catch {
      setAttFlip((a) => {
        const copy = { ...a };
        delete copy[studentId];
        return copy;
      });
      setError("Could not save attendance. Check your connection and tap again.");
    }
  }

  const attendanceOf = (row: RowData) =>
    attFlip[row.student.id] !== undefined ? attFlip[row.student.id] : row.present;

  const presentCount = rows.filter((r) => attendanceOf(r) === true).length;
  const marked = rows.filter((r) => attendanceOf(r) !== null).length;
  const absent = rows.filter((r) => attendanceOf(r) === false).length;

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

      {/* Stacked rather than side by side: the status line is long enough that
          sharing a row with a fixed-width tab group squeezed it to about 140px
          on a 380px phone, where it wrapped mid-phrase. */}
      <p className="eyebrow" style={{ margin: "0 0 6px" }}>
        {prettyDate(date)} · {loggedCount} lesson{loggedCount === 1 ? "" : "s"} logged
        {" · "}
        {presentCount} of {rows.length} marked present
        {absent > 0 && ` · ${absent} absent`}
      </p>
      <div className="tabs" style={{ marginTop: 0, marginBottom: 8 }}>
        <button data-active={scope === "mine"} onClick={() => go({ scope: "mine" })}>
          My students
        </button>
        <button data-active={scope === "all"} onClick={() => go({ scope: "all" })}>
          Everyone
        </button>
      </div>

      {rows.length > 0 && marked < rows.length && (
        <button
          className="btn ghost"
          style={{ width: "100%", marginBottom: 8 }}
          disabled={attBusy}
          onClick={async () => {
            setAttBusy(true);
            setError(null);
            try {
              // Only the unmarked ones: this must never overwrite an absence
              // another teacher already recorded.
              const unmarked = rows.filter((r) => attendanceOf(r) === null);
              const res = await markAllPresent(
                unmarked.map((r) => r.student.id),
                date
              );
              if (!res.ok) {
                buzz([40, 60, 40]);
                setError(res.error);
                return;
              }
              setAttFlip((a) => {
                const copy = { ...a };
                for (const r of unmarked) copy[r.student.id] = true;
                return copy;
              });
              buzz(12);

              const ids = unmarked.map((r) => r.student.id);
              offerUndo(
                `Marked ${ids.length} present.`,
                async () => {
                  await clearAttendanceFor(ids, date);
                  setAttFlip((a) => {
                    const copy = { ...a };
                    for (const id of ids) copy[id] = null;
                    return copy;
                  });
                }
              );

              startTransition(() => router.refresh());
            } catch {
              setError("Could not mark everyone present. Check your connection.");
            } finally {
              setAttBusy(false);
            }
          }}
        >
          Mark remaining {rows.length - marked} present
        </button>
      )}

      {error && <p className="err">{error}</p>}

      {rows.length === 0 ? (
        <div className="empty">No students to show for this view.</div>
      ) : (
        <div className="register">
          {rows.map((row) => {
            const present = attendanceOf(row);
            return (
            <article className="row" key={row.student.id} data-absent={present === false}>
              <header>
                <span className="name">{row.student.name}</span>
                <span className="grade">{gradeLabel(row.student.grade)}</span>
                {row.alsoToday.length > 0 && (
                  <span className="meta">also: {row.alsoToday.join(", ")}</span>
                )}
              </header>

              <button
                className="attend"
                data-state={present === null ? "unmarked" : present ? "present" : "absent"}
                aria-label={`${row.student.name}: ${
                  present === null ? "not marked" : present ? "present" : "absent"
                }. Tap to change.`}
                onClick={() => cycleAttendance(row.student.id, present)}
              >
                {present === null ? "Mark attendance" : present ? "Present" : "Absent"}
              </button>

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
                      onClick={() =>
                        tap(
                          row.student.id,
                          sub.id,
                          on,
                          sub.name,
                          row.student.name,
                          noteFlip[key] !== undefined ? noteFlip[key] : sub.note
                        )
                      }
                      aria-pressed={on}
                      aria-label={
                        on
                          ? `${sub.name}: logged today. Tap to undo.`
                          : `${sub.name}: not logged today. Tap to log.`
                      }
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
            );
          })}
        </div>
      )}

      {undo && (
        <UndoToast
          message={undo.message}
          busy={undoBusy}
          onDismiss={clearUndo}
          onUndo={async () => {
            setUndoBusy(true);
            try {
              await undo.run();
              buzz([8, 40, 8]);
              startTransition(() => router.refresh());
            } catch {
              setError("Could not undo that. Check your connection.");
            } finally {
              setUndoBusy(false);
              clearUndo();
            }
          }}
        />
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
