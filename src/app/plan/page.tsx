import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import Nav from "@/components/Nav";
import { daysBetween, prettyDate, shiftDate, todayISO } from "@/lib/dates";
import type { Subject, Student } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * What to teach next, scored — not a fixed timetable.
 *
 * A generated timetable breaks the first time a student is absent or a
 * chapter runs long. This ranks every student-subject pair instead, so the
 * list re-sorts itself around whatever actually happened yesterday.
 *
 *   exam pressure : nearer exam = higher, only within 30 days
 *   neglect       : days since that student last had that subject, capped
 */
function score(daysToExam: number | null, daysSince: number | null) {
  const exam = daysToExam !== null && daysToExam >= 0 ? Math.max(0, 30 - daysToExam) * 3 : 0;
  const neglect = Math.min(daysSince ?? 30, 21) * 2;
  return exam + neglect;
}

export default async function PlanPage() {
  const supabase = await createClient();
  const userId = await requireUserId();

  const today = todayISO();

  const [{ data: subjectRows }, { data: links }] = await Promise.all([
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    supabase.from("teacher_students").select("student_id").eq("teacher_id", userId),
  ]);

  const subjects = (subjectRows ?? []) as Subject[];
  const myIds = (links ?? []).map((l) => l.student_id as string);

  if (myIds.length === 0) {
    return (
      <>
        <TopBar eyebrow="What to teach" title="Plan" />
        <main className="wrap" style={{ paddingTop: 20 }}>
          <div className="empty">
            Add students to your list first.{" "}
            <Link href="/students" style={{ textDecoration: "underline" }}>
              Students →
            </Link>
          </div>
        </main>
        <Nav />
      </>
    );
  }

  const [{ data: studentRows }, { data: history }, { data: exams }] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, grade, school, active")
      .eq("active", true)
      .in("id", myIds)
      .order("grade")
      .order("name"),
    supabase
      .from("lessons")
      .select("student_id, subject_id, taught_on, note")
      .gte("taught_on", shiftDate(today, -90))
      .in("student_id", myIds),
    supabase
      .from("exams")
      .select("student_id, subject_id, exam_date")
      .gte("exam_date", today)
      .in("student_id", myIds)
      .order("exam_date"),
  ]);

  const students = (studentRows ?? []) as Student[];

  const lastTaught = new Map<string, string>();
  // Where this subject was left off, so the suggestion says what to teach next
  // rather than only that something is overdue.
  const lastNote = new Map<string, string>();
  for (const l of history ?? []) {
    const key = `${l.student_id}|${l.subject_id}`;
    const prev = lastTaught.get(key);
    if (!prev || (l.taught_on as string) > prev) {
      lastTaught.set(key, l.taught_on as string);
      if (l.note) lastNote.set(key, l.note as string);
      else lastNote.delete(key);
    }
  }

  const nextExam = new Map<string, string>();
  for (const e of exams ?? []) {
    if (!e.subject_id) continue;
    const key = `${e.student_id}|${e.subject_id}`;
    if (!nextExam.has(key)) nextExam.set(key, e.exam_date as string);
  }

  const items = students
    .flatMap((s) =>
      subjects
        .filter((sub) => s.grade >= sub.min_grade && s.grade <= sub.max_grade)
        .map((sub) => {
          const key = `${s.id}|${sub.id}`;
          const last = lastTaught.get(key) ?? null;
          const exam = nextExam.get(key) ?? null;
          const daysSince = last ? daysBetween(last, today) : null;
          const toExam = exam ? daysBetween(today, exam) : null;
          return {
            student: s,
            subject: sub,
            last,
            exam,
            daysSince,
            toExam,
            lastNote: lastNote.get(key) ?? null,
            value: score(toExam, daysSince),
          };
        })
    )
    .filter((i) => i.daysSince !== 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 25);

  const byGrade = new Map<number, typeof items>();
  for (const i of items) {
    const list = byGrade.get(i.student.grade) ?? [];
    list.push(i);
    byGrade.set(i.student.grade, list);
  }

  return (
    <>
      <TopBar eyebrow="What to teach" title="Plan" />
      <main className="wrap stack" style={{ paddingTop: 12 }}>
        <p className="hint">
          Ranked for {prettyDate(today)} by exam pressure and how long each
          student has gone without that subject. Teach top-down; anything you log
          drops off tomorrow.
        </p>

        {[...byGrade.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([grade, list]) => (
            <section className="card stack" key={grade}>
              <h2>Class {grade}</h2>
              {list.map((i) => (
                <div
                  className="between"
                  key={`${i.student.id}|${i.subject.id}`}
                  style={{ borderTop: "1px solid var(--rule)", paddingTop: 8 }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {i.student.name} · {i.subject.name}
                    </div>
                    <div className="hint">
                      {i.toExam !== null
                        ? `Exam in ${i.toExam} day${i.toExam === 1 ? "" : "s"} · `
                        : ""}
                      {i.daysSince === null
                        ? "never taught"
                        : `last taught ${i.daysSince}d ago`}
                    </div>
                    {i.lastNote && (
                      <div className="hint">
                        Left off at <span className="mono">{i.lastNote}</span>
                      </div>
                    )}
                  </div>
                  <span
                    className="gap"
                    data-level={i.value >= 60 ? "bad" : i.value >= 30 ? "warn" : undefined}
                  >
                    {i.value}
                  </span>
                </div>
              ))}
            </section>
          ))}

        {items.length === 0 && (
          <div className="empty">Nothing pending — everything is recently covered.</div>
        )}
      </main>
      <Nav />
    </>
  );
}
