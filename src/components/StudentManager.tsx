"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addStudent,
  copyExamsToStudents,
  removeExam,
  restoreStudent,
  retireStudent,
  setExam,
  setMyStudent,
  updateStudent,
} from "@/app/actions";
import { daysBetween, prettyDateLong, todayISO } from "@/lib/dates";
import type { Exam, Student, Subject } from "@/lib/types";

/**
 * The roster screen.
 *
 * The thing to keep in mind here: students belong to the tuition, not to a
 * teacher. This list shows every child in the building; "my list" is just a
 * link in teacher_students that decides who shows up on Today and Plan. Two
 * teachers who both teach Aarav see one Aarav and one exam timetable.
 */
export default function StudentManager({
  students,
  subjects,
  exams,
  myIds,
}: {
  students: Student[];
  subjects: Subject[];
  exams: Exam[];
  myIds: string[];
}) {
  const [, startTransition] = useTransition();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Optimistic overlay for the "mine" toggle, so the chip flips on tap.
  const [mineFlip, setMineFlip] = useState<Record<string, boolean>>({});
  const isMine = (id: string) => mineFlip[id] ?? myIds.includes(id);

  const today = todayISO();

  const [form, setForm] = useState({ name: "", grade: "5", school: "" });

  // Which student's edit form is open, and its working copy.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", grade: "5", school: "" });

  const active = students.filter((s) => s.active);
  const retired = students.filter((s) => !s.active);

  async function run(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active
      .filter((s) => (scope === "mine" ? isMine(s.id) : true))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.school ?? "").toLowerCase().includes(q) ||
          String(s.grade) === q
      );
    // mineFlip and myIds are the inputs isMine() closes over, so they are the
    // deps even though isMine itself is not referenced by name here.
  }, [students, scope, query, mineFlip, myIds]);

  /** Upcoming exams for one student, soonest first. */
  function examsFor(studentId: string) {
    return exams
      .filter((e) => e.student_id === studentId && e.exam_date >= today)
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
  }

  return (
    <>
      <div className="tabs">
        <button data-active={scope === "mine"} onClick={() => setScope("mine")}>
          My students
        </button>
        <button data-active={scope === "all"} onClick={() => setScope("all")}>
          Everyone
        </button>
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <input
          type="search"
          placeholder="Search name, school or class"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search students"
        />
      </div>

      {error && <p className="err">{error}</p>}
      {notice && (
        <p className="hint" style={{ color: "var(--teal)" }}>
          {notice}
        </p>
      )}

      {/* ---------------- add ---------------- */}
      {adding ? (
        <form
          className="card stack"
          style={{ marginBottom: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await addStudent({
                name: form.name,
                grade: Number(form.grade),
                school: form.school,
              });
              setForm({ name: "", grade: form.grade, school: form.school });
              setAdding(false);
              startTransition(() => {});
            }, "Student added to the tuition list.");
          }}
        >
          <div className="field">
            <label htmlFor="new-name">Name</label>
            <input
              id="new-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="between" style={{ gap: 10, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="new-grade">Class</label>
              <select
                id="new-grade"
                value={form.grade}
                onChange={(e) => setForm({ ...form, grade: e.target.value })}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label htmlFor="new-school">School</label>
              <input
                id="new-school"
                value={form.school}
                onChange={(e) => setForm({ ...form, school: e.target.value })}
                placeholder="optional"
              />
            </div>
          </div>
          <div className="between" style={{ gap: 8 }}>
            <button className="btn" disabled={busy} style={{ flex: 1 }}>
              Add student
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => setAdding(false)}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
          </div>
          <p className="hint">
            Everyone shares one roster. If another teacher has already added this
            child, you will be told — add them to your list instead of making a
            second record.
          </p>
        </form>
      ) : (
        <button className="btn" style={{ width: "100%", marginBottom: 12 }} onClick={() => setAdding(true)}>
          Add student
        </button>
      )}

      {/* ---------------- list ---------------- */}
      {visible.length === 0 ? (
        <div className="empty">
          {scope === "mine"
            ? "No students on your list yet. Switch to Everyone and add the ones you teach."
            : "No students match that search."}
        </div>
      ) : (
        <div className="register">
          {visible.map((s) => {
            const mine = isMine(s.id);
            const open = openId === s.id;
            const upcoming = examsFor(s.id);
            const applicable = subjects.filter(
              (sub) => s.grade >= sub.min_grade && s.grade <= sub.max_grade
            );

            return (
              <article className="row" key={s.id}>
                <header>
                  <span className="name">{s.name}</span>
                  <span className="grade">Class {s.grade}</span>
                  {s.school && <span className="meta">{s.school}</span>}
                </header>

                <div className="chips">
                  <button
                    className="chip"
                    data-on={mine}
                    aria-pressed={mine}
                    disabled={busy}
                    onClick={() => {
                      setMineFlip((f) => ({ ...f, [s.id]: !mine }));
                      run(async () => {
                        await setMyStudent(s.id, !mine);
                      });
                    }}
                  >
                    {mine ? "On my list" : "Add to my list"}
                  </button>

                  <button className="chip" onClick={() => setOpenId(open ? null : s.id)}>
                    Exams
                    <span className="days">{upcoming.length ? upcoming.length : "none"}</span>
                  </button>

                  <button
                    className="chip"
                    onClick={() => {
                      const next = editingId === s.id ? null : s.id;
                      setEditingId(next);
                      if (next) {
                        setEdit({
                          name: s.name,
                          grade: String(s.grade),
                          school: s.school ?? "",
                        });
                      }
                    }}
                  >
                    Edit
                  </button>
                </div>

                {upcoming.length > 0 && !open && (
                  <div className="gapbar" style={{ marginTop: 8 }}>
                    {upcoming.slice(0, 4).map((e) => {
                      const days = daysBetween(today, e.exam_date);
                      const subject = subjects.find((sub) => sub.id === e.subject_id);
                      return (
                        <span
                          className="gap"
                          key={e.id}
                          data-level={days <= 7 ? "bad" : days <= 21 ? "warn" : undefined}
                        >
                          {subject?.name ?? e.title ?? "Exam"} · {days}d
                        </span>
                      );
                    })}
                  </div>
                )}

                {editingId === s.id && (
                  <form
                    className="stack"
                    style={{
                      marginTop: 10,
                      borderTop: "1px solid var(--rule)",
                      paddingTop: 10,
                    }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () => {
                        await updateStudent(s.id, {
                          name: edit.name,
                          grade: Number(edit.grade),
                          school: edit.school,
                        });
                        setEditingId(null);
                      }, "Saved.");
                    }}
                  >
                    <div className="field">
                      <label htmlFor={`edit-name-${s.id}`}>Name</label>
                      <input
                        id={`edit-name-${s.id}`}
                        required
                        value={edit.name}
                        onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      />
                    </div>
                    <div className="between" style={{ gap: 10, alignItems: "flex-end" }}>
                      <div className="field" style={{ flex: 1 }}>
                        <label htmlFor={`edit-grade-${s.id}`}>Class</label>
                        <select
                          id={`edit-grade-${s.id}`}
                          value={edit.grade}
                          onChange={(e) => setEdit({ ...edit, grade: e.target.value })}
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field" style={{ flex: 2 }}>
                        <label htmlFor={`edit-school-${s.id}`}>School</label>
                        <input
                          id={`edit-school-${s.id}`}
                          value={edit.school}
                          onChange={(e) => setEdit({ ...edit, school: e.target.value })}
                          placeholder="optional"
                        />
                      </div>
                    </div>
                    <div className="between" style={{ gap: 8 }}>
                      <button className="btn" style={{ flex: 1 }} disabled={busy}>
                        Save changes
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ flex: 1 }}
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="hint">
                      Moving a child up a class changes which subjects show for
                      them, since each subject covers a class range.
                    </p>
                  </form>
                )}

                {open && (
                  <ExamPanel
                    student={s}
                    subjects={applicable}
                    exams={upcoming}
                    classmates={active.filter(
                      (o) =>
                        o.id !== s.id &&
                        o.grade === s.grade &&
                        (s.school ? o.school === s.school : true)
                    )}
                    busy={busy}
                    onRun={run}
                  />
                )}

                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn danger"
                    style={{ padding: "6px 10px", minHeight: 36, fontSize: "0.8rem" }}
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`Retire ${s.name}? Their past lessons stay in the reports.`)) return;
                      run(async () => {
                        await retireStudent(s.id);
                      }, `${s.name} retired.`);
                    }}
                  >
                    Retire
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {retired.length > 0 && (
        <section className="card stack" style={{ marginTop: 16 }}>
          <div className="between">
            <span className="eyebrow">Retired</span>
            <span className="eyebrow">{retired.length}</span>
          </div>
          <div className="chips">
            {retired.map((s) => (
              <button
                key={s.id}
                className="chip"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await restoreStudent(s.id);
                  }, `${s.name} is back on the register.`)
                }
              >
                {s.name}
                <span className="days">Class {s.grade} · restore</span>
              </button>
            ))}
          </div>
          <p className="hint">
            Their lessons were kept. Restoring puts them back on the daily
            register exactly as they were.
          </p>
        </section>
      )}

      <p className="hint" style={{ marginTop: 14 }}>
        Retiring keeps a student&rsquo;s history and takes them off the daily
        register. Nothing here is ever deleted, and anyone retired can be
        brought back from the list above.
      </p>
    </>
  );
}

/**
 * Per-student exam timetable: one date per subject, plus the button that copies
 * the whole timetable onto classmates from the same school. Entering a batch of
 * twelve children one date at a time is the thing that stops teachers bothering.
 */
function ExamPanel({
  student,
  subjects,
  exams,
  classmates,
  busy,
  onRun,
}: {
  student: Student;
  subjects: Subject[];
  exams: Exam[];
  classmates: Student[];
  busy: boolean;
  onRun: (fn: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const dateFor = (subjectId: string) =>
    exams.find((e) => e.subject_id === subjectId)?.exam_date ?? "";

  return (
    <div className="stack" style={{ marginTop: 10, borderTop: "1px solid var(--rule)", paddingTop: 10 }}>
      {subjects.map((sub) => {
        const current = dateFor(sub.id);
        const exam = exams.find((e) => e.subject_id === sub.id);
        return (
          <div className="between" key={sub.id} style={{ gap: 8 }}>
            <span style={{ minWidth: 110, fontSize: "0.9rem" }}>{sub.name}</span>
            <input
              type="date"
              className="mono"
              style={{
                flex: 1,
                border: "1px solid var(--rule)",
                borderRadius: 8,
                padding: "9px 10px",
                minHeight: 40,
                background: "var(--card)",
              }}
              value={current}
              min={todayISO()}
              aria-label={`${sub.name} exam date for ${student.name}`}
              disabled={busy}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                onRun(async () => {
                  await setExam({
                    studentId: student.id,
                    subjectId: sub.id,
                    examDate: value,
                  });
                });
              }}
            />
            {exam && (
              <button
                className="btn ghost"
                style={{ padding: "6px 10px", minHeight: 40 }}
                disabled={busy}
                aria-label={`Clear ${sub.name} exam date`}
                onClick={() =>
                  onRun(async () => {
                    await removeExam(exam.id);
                  })
                }
              >
                ✕
              </button>
            )}
          </div>
        );
      })}

      {exams.length > 0 && classmates.length > 0 && (
        <>
          {copyOpen ? (
            <div className="stack" style={{ borderTop: "1px dashed var(--rule)", paddingTop: 10 }}>
              <span className="eyebrow">
                Copy {student.name}&rsquo;s {exams.length} upcoming date
                {exams.length === 1 ? "" : "s"} to
              </span>
              <div className="chips">
                {classmates.map((c) => {
                  const on = picked.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      className="chip"
                      data-on={on}
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((p) => (on ? p.filter((id) => id !== c.id) : [...p, c.id]))
                      }
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <div className="between" style={{ gap: 8 }}>
                <button
                  className="btn"
                  style={{ flex: 1 }}
                  disabled={busy || picked.length === 0}
                  onClick={() =>
                    onRun(async () => {
                      const res = await copyExamsToStudents(student.id, picked);
                      setPicked([]);
                      setCopyOpen(false);
                      return res;
                    }, "Timetable copied.")
                  }
                >
                  Copy to {picked.length || "…"}
                </button>
                <button className="btn ghost" style={{ flex: 1 }} onClick={() => setCopyOpen(false)}>
                  Cancel
                </button>
              </div>
              <p className="hint">
                This replaces the selected students&rsquo; upcoming exam dates,
                so running it twice is safe. Past exams are left alone.
              </p>
            </div>
          ) : (
            <button className="btn ghost" onClick={() => setCopyOpen(true)}>
              Copy timetable to classmates
            </button>
          )}
        </>
      )}

      {exams.length > 0 && (
        <p className="hint">
          Next: {prettyDateLong(exams[0].exam_date)}
          {exams[0].subject_id
            ? ` · ${subjects.find((s) => s.id === exams[0].subject_id)?.name ?? ""}`
            : ""}
        </p>
      )}
    </div>
  );
}
