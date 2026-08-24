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
import { GRADES, MAX_GRADE, MIN_GRADE, gradeLabel, gradeShort } from "@/lib/grades";

// A new subject covers every level by default, the same as the seeded ones.
// Narrowing is the deliberate act: being offered a chip you do not need costs a
// glance, whereas a missing chip costs a lesson that never gets logged at all.
const BLANK = { name: "", min: String(MIN_GRADE), max: String(MAX_GRADE) };

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

  const [form, setForm] = useState(BLANK);

  const active = subjects.filter((s) => s.active);
  const retired = subjects.filter((s) => !s.active);

  /**
   * Runs a write and surfaces whatever it reports.
   *
   * Actions return their errors rather than throwing, because Next strips the
   * message off anything thrown in a production build — which is what React
   * error #441 is. The catch below is only for the request never completing.
   */
  async function run(fn: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fn();
      if (res && typeof res === "object" && "ok" in res && res.ok === false) {
        setError(String((res as { error?: string }).error ?? "That did not save."));
        return;
      }
      if (success) setNotice(success);
    } catch {
      setError("Could not reach the register. Check your connection and try again.");
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
                const res = await setMySubjects(picked);
                if (res.ok) setDirty(false);
                return res;
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
          Every subject is offered at every level, Hobby Centre to Class 12, so
          any chip you need is always there. Narrow a range here if you would
          rather a subject stopped appearing on some rows &mdash; Science
          6&ndash;12 would then vanish from a Class 3 row.
        </p>

        {adding ? (
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const res = await addSubject({
                  name: form.name,
                  minGrade: Number(form.min),
                  maxGrade: Number(form.max),
                });
                if (res.ok) {
                  setForm(BLANK);
                  setAdding(false);
                }
                return res;
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
                <div className="stack">
                <div className="between" style={{ gap: 8 }}>
                  <select
                    className="mono"
                    defaultValue={s.min_grade}
                    style={{ flex: 1, minHeight: 44, borderRadius: 8, border: "1px solid var(--rule)", padding: "0 8px" }}
                    aria-label={`${s.name} from class`}
                    onChange={(e) =>
                      run(async () => {
                        return updateSubject(s.id, { minGrade: Number(e.target.value) });
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
                    style={{ flex: 1, minHeight: 44, borderRadius: 8, border: "1px solid var(--rule)", padding: "0 8px" }}
                    aria-label={`${s.name} to class`}
                    onChange={(e) =>
                      run(async () => {
                        return updateSubject(s.id, { maxGrade: Number(e.target.value) });
                      })
                    }
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        to {gradeShort(g)}
                      </option>
                    ))}
                  </select>
                    <button
                      className="btn ghost"
                      style={{ minHeight: 44 }}
                      onClick={() => setEditing(null)}
                    >
                      Done
                    </button>
                  </div>

                  {/* Retiring lives behind Edit rather than sitting in the row.
                      It was one thumb-width from Class range, in the alarm
                      colour, on a screen a teacher opens to change a range. */}
                  <button
                    className="btn danger"
                    disabled={busy}
                    onClick={() => {
                      const ok = confirm(
                        [
                          `Retire ${s.name}?`,
                          "",
                          "Every lesson already logged against this subject is kept, and still appears in past reports.",
                          "",
                          "It simply stops appearing as a chip on Today. You can bring it back from the Retired list at any time.",
                        ].join("\n")
                      );
                      if (!ok) return;
                      run(async () => {
                        const res = await retireSubject(s.id);
                        if (res.ok) setEditing(null);
                        return res;
                      }, `${s.name} retired. Restore it from the Retired list below.`);
                    }}
                  >
                    Retire {s.name}
                  </button>
                </div>
              ) : (
                <div className="chips">
                  <button className="chip" onClick={() => setEditing(s.id)}>
                    Edit
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
                      return restoreSubject(s.id);
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
