"use client";

import { useState } from "react";
import { deleteLessonById, setLessonNoteById } from "@/app/actions";
import { daysBetween, prettyDate, prettyDateLong, todayISO } from "@/lib/dates";

export type HistoryEntry = {
  id: string;
  date: string;
  subject: string;
  teacher: string;
  note: string | null;
  /** Logged by the signed-in teacher, so RLS will allow editing it. */
  mine: boolean;
};

type ExamEntry = {
  id: string;
  date: string;
  subject: string | null;
  title: string | null;
};

/**
 * One child's record: what was taught, by whom, and what was covered.
 *
 * Entries logged by other teachers render read-only. That is not politeness —
 * lessons_update and lessons_delete both require teacher_id = auth.uid(), so
 * offering the buttons would just produce a refusal. Showing them as plainly
 * not-yours is more honest than a control that always fails.
 */
export default function StudentHistory({
  studentName,
  entries,
  exams,
  attendance,
  capped,
}: {
  studentName: string;
  entries: HistoryEntry[];
  exams: ExamEntry[];
  attendance: { date: string; present: boolean }[];
  capped: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Local overrides so an edit or delete shows before the server round trip.
  const [noteFlip, setNoteFlip] = useState<Record<string, string | null>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  const today = todayISO();
  const upcoming = exams.filter((e) => e.date >= today);
  const visible = entries.filter((e) => !removed.has(e.id));

  const presentDays = attendance.filter((a) => a.present).length;
  const absentDays = attendance.filter((a) => !a.present).length;

  async function run(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fn();
      if (res && typeof res === "object" && "ok" in res && res.ok === false) {
        setError(String((res as { error?: string }).error ?? "That did not save."));
        return false;
      }
      if (success) setNotice(success);
      return true;
    } catch {
      setError("Could not reach the register. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Group by date so a day reads as a day, not as scattered rows.
  const byDate = new Map<string, HistoryEntry[]>();
  for (const e of visible) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }

  return (
    <>
      {error && <p className="err">{error}</p>}
      {notice && (
        <p className="hint" style={{ color: "var(--teal)" }}>
          {notice}
        </p>
      )}

      {/* ---------------- exam dates ---------------- */}
      <section className="card stack">
        <div className="between">
          <h2>Exam dates</h2>
          <span className="eyebrow">{upcoming.length} upcoming</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="hint">
            No upcoming exams recorded. Add them from the Students screen.
          </p>
        ) : (
          <div className="gapbar">
            {upcoming.map((e) => {
              const days = daysBetween(today, e.date);
              return (
                <span
                  className="gap"
                  key={e.id}
                  data-level={days <= 7 ? "bad" : days <= 21 ? "warn" : undefined}
                >
                  {e.subject ?? e.title ?? "Exam"} · {prettyDateLong(e.date)} · {days}d
                </span>
              );
            })}
          </div>
        )}
      </section>

      {/* ---------------- attendance summary ---------------- */}
      {attendance.length > 0 && (
        <section className="card stack">
          <h2>Attendance</h2>
          <div className="gapbar">
            <span className="gap" data-level={absentDays === 0 ? "ok" : undefined}>
              present {presentDays}
            </span>
            {absentDays > 0 && (
              <span className="gap" data-level="bad">
                absent {absentDays}
              </span>
            )}
          </div>
          <p className="hint">Days that were marked. Unmarked days count as neither.</p>
        </section>
      )}

      {/* ---------------- lesson history ---------------- */}
      <div className="between" style={{ marginTop: 4 }}>
        <h2>Lessons</h2>
        <span className="eyebrow">{visible.length} entries</span>
      </div>

      {visible.length === 0 ? (
        <div className="empty">Nothing has been logged for {studentName} yet.</div>
      ) : (
        <div className="register">
          {[...byDate.entries()].map(([date, list]) => (
            <article className="row" key={date}>
              <header>
                <span className="name">{prettyDate(date)}</span>
                <span className="grade">{prettyDateLong(date)}</span>
              </header>

              <div className="chapters">
                {list.map((e) => {
                  const note = noteFlip[e.id] !== undefined ? noteFlip[e.id] : e.note;

                  if (editing === e.id) {
                    return (
                      <form
                        className="chapter-edit"
                        key={e.id}
                        onSubmit={async (ev) => {
                          ev.preventDefault();
                          const text = draft.trim();
                          const ok = await run(async () => {
                            const res = await setLessonNoteById(e.id, text);
                            if (res.ok) setNoteFlip((n) => ({ ...n, [e.id]: res.note }));
                            return res;
                          }, "Chapter saved.");
                          if (ok) {
                            setEditing(null);
                            setDraft("");
                          }
                        }}
                      >
                        <label className="eyebrow" htmlFor={`h-${e.id}`}>
                          {e.subject} — chapter or topic
                        </label>
                        <input
                          id={`h-${e.id}`}
                          autoFocus
                          maxLength={120}
                          value={draft}
                          disabled={busy}
                          onChange={(ev) => setDraft(ev.target.value)}
                          placeholder="e.g. Ch 4 Fractions"
                        />
                        <div className="between" style={{ gap: 6 }}>
                          <button className="btn" style={{ flex: 1 }} disabled={busy}>
                            {busy ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ flex: 1 }}
                            disabled={busy}
                            onClick={() => {
                              setEditing(null);
                              setDraft("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn danger"
                          disabled={busy}
                          onClick={async () => {
                            const ok = confirm(
                              [
                                `Delete the ${e.subject} entry for ${prettyDateLong(e.date)}?`,
                                "",
                                "This removes the lesson and its chapter from every report. It cannot be undone from here.",
                              ].join("\n")
                            );
                            if (!ok) return;
                            const done = await run(
                              () => deleteLessonById(e.id),
                              "Entry deleted."
                            );
                            if (done) {
                              setRemoved((r) => new Set(r).add(e.id));
                              setEditing(null);
                            }
                          }}
                        >
                          Delete this entry
                        </button>
                      </form>
                    );
                  }

                  return (
                    <div key={e.id} className="chapter" data-static={e.mine ? undefined : "true"}>
                      <span className="subj">{e.subject}</span>
                      <span className="what">
                        {note || <em style={{ opacity: 0.7 }}>no chapter recorded</em>}
                      </span>
                      <span
                        className="mono"
                        style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--ink-soft)", flexShrink: 0 }}
                      >
                        {e.teacher}
                      </span>
                      {e.mine && (
                        <button
                          className="btn ghost"
                          style={{ minHeight: 32, padding: "4px 10px", fontSize: "0.72rem", flexShrink: 0 }}
                          onClick={() => {
                            setEditing(e.id);
                            setDraft(note ?? "");
                          }}
                          aria-label={`Edit the ${e.subject} entry for ${prettyDateLong(e.date)}`}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="hint" style={{ marginTop: 14 }}>
        Entries show the teacher who logged them. You can edit or delete only
        your own — the database enforces that, not just this screen.
        {capped && " Showing the most recent 200 entries."}
      </p>
    </>
  );
}
