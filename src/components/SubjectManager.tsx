"use client";

import { useState } from "react";
import {
  addSubject,
  restoreSubject,
  retireSubject,
  setMySubjects,
  updateSubject,
} from "@/app/actions";
import type { Subject } from "@/lib/types";
import { GRADES, gradeLabel, gradeShort } from "@/lib/grades";

/**
 * One shared subject list for the whole tuition, plus a per-teacher filter.
 *
 * The list is shared because "Maths" has to mean the same row for everyone, or
 * coverage reports across two teachers stop adding up. What differs per teacher
 * is which of those subjects they care to see — that lives in teacher_subjects,
 * and selecting none means see everything.
 */
export default function SubjectManager({
  subjects,
  mySubjectIds,
}: {
  subjects: Subject[];
  mySubjectIds: string[];
}) {
  const [picked, setPicked] = useState<string[]>(mySubjectIds);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", min: "1", max: "12" });

  const active = subjects.filter((s) => s.active);
  const retired = subjects.filter((s) => !s.active);

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

  function toggle(id: string) {
    setDirty(true);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  return (
    <>
      <section className="card stack" style={{ marginTop: 12 }}>
        <div>
          <h2>What you teach</h2>
          <p className="hint">
            Tap the subjects you take. Leave every one unselected to see the full
            list — that is the right setting if you teach a whole class.
          </p>
        </div>

        <div className="chips">
          {active.map((s) => {
            const on = picked.includes(s.id);
            return (
              <button
                key={s.id}
                className="chip"
                data-on={on}
                aria-pressed={on}
                onClick={() => toggle(s.id)}
              >
                {s.name}
              </button>
            );
          })}
        </div>

        {dirty && (
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await setMySubjects(picked);
                setDirty(false);
              }, picked.length === 0 ? "Saved — you will see every subject." : "Saved.")
            }
          >
            Save my subjects
          </button>
        )}
      </section>

      {error && <p className="err">{error}</p>}
      {notice && (
        <p className="hint" style={{ color: "var(--teal)" }}>
          {notice}
        </p>
      )}

      <section className="stack" style={{ marginTop: 16 }}>
        <div className="between">
          <h2>The tuition&rsquo;s subjects</h2>
          <span className="eyebrow">{active.length} active</span>
        </div>

        <p className="hint">
          Class range decides which children see a subject: Rhymes LKG&ndash;UKG
          shows on a UKG row, Science 6&ndash;12 does not.
        </p>

        {adding ? (
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await addSubject({
                  name: form.name,
                  minGrade: Number(form.min),
                  maxGrade: Number(form.max),
                });
                setForm({ name: "", min: "1", max: "12" });
                setAdding(false);
              }, "Subject added.");
            }}
          >
            <div className="field">
              <label htmlFor="sub-name">Subject name</label>
              <input
                id="sub-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="between" style={{ gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="sub-min">From class</label>
                <select
                  id="sub-min"
                  value={form.min}
                  onChange={(e) => setForm({ ...form, min: e.target.value })}
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {gradeLabel(g)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="sub-max">To class</label>
                <select
                  id="sub-max"
                  value={form.max}
                  onChange={(e) => setForm({ ...form, max: e.target.value })}
                >
                  {GRADES.map((g) => (
                    <option key={g} value={g}>
                      {gradeLabel(g)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="between" style={{ gap: 8 }}>
              <button className="btn" style={{ flex: 1 }} disabled={busy}>
                Add subject
              </button>
              <button
                type="button"
                className="btn ghost"
                style={{ flex: 1 }}
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="btn" style={{ width: "100%" }} onClick={() => setAdding(true)}>
            Add subject
          </button>
        )}

        <div className="register">
          {active.map((s) => (
            <article className="row" key={s.id}>
              <header>
                <span className="name">{s.name}</span>
                <span className="grade">
                  {gradeShort(s.min_grade)}&ndash;{gradeShort(s.max_grade)}
                </span>
              </header>

              {editing === s.id ? (
                <div className="between" style={{ gap: 8 }}>
                  <select
                    className="mono"
                    defaultValue={s.min_grade}
                    style={{ flex: 1, minHeight: 40, borderRadius: 8, border: "1px solid var(--rule)", padding: "0 8px" }}
                    aria-label={`${s.name} from class`}
                    onChange={(e) =>
                      run(async () => {
                        await updateSubject(s.id, { minGrade: Number(e.target.value) });
                      })
                    }
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        from {gradeShort(g)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="mono"
                    defaultValue={s.max_grade}
                    style={{ flex: 1, minHeight: 40, borderRadius: 8, border: "1px solid var(--rule)", padding: "0 8px" }}
                    aria-label={`${s.name} to class`}
                    onChange={(e) =>
                      run(async () => {
                        await updateSubject(s.id, { maxGrade: Number(e.target.value) });
                      })
                    }
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        to {gradeShort(g)}
                      </option>
                    ))}
                  </select>
                  <button className="btn ghost" style={{ minHeight: 40 }} onClick={() => setEditing(null)}>
                    Done
                  </button>
                </div>
              ) : (
                <div className="chips">
                  <button className="chip" onClick={() => setEditing(s.id)}>
                    Class range
                  </button>
                  <button
                    className="chip"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !confirm(
                          `Retire ${s.name}? Lessons already logged against it stay in the reports.`
                        )
                      )
                        return;
                      run(async () => {
                        await retireSubject(s.id);
                      }, `${s.name} retired.`);
                    }}
                  >
                    Retire
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>

        {retired.length > 0 && (
          <>
            <span className="eyebrow" style={{ marginTop: 8 }}>
              Retired
            </span>
            <div className="chips">
              {retired.map((s) => (
                <button
                  key={s.id}
                  className="chip"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await restoreSubject(s.id);
                    }, `${s.name} is back on the list.`)
                  }
                >
                  {s.name}
                  <span className="days">restore</span>
                </button>
              ))}
            </div>
          </>
        )}

        <p className="hint">
          Subjects are retired, never deleted, so every lesson ever logged keeps
          a subject to point at.
        </p>
      </section>
    </>
  );
}
