import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import Nav from "@/components/Nav";
import StudentHistory, { type HistoryEntry } from "@/components/StudentHistory";
import { gradeLabel } from "@/lib/grades";
import type { Student, Subject } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Everything recorded about one child, newest first.
 *
 * Capped at the most recent 200 entries rather than fetching the lot. A child
 * taught daily across eight subjects accumulates roughly two thousand rows a
 * year, and nobody scrolls that far — an unbounded read here would get slower
 * every term for no benefit.
 */
const HISTORY_LIMIT = 200;

export default async function StudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const userId = await requireUserId();

  const [{ data: student }, { data: subjectRows }, { data: teacherRows }] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, grade, school, active")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("subjects").select("id, name").order("sort_order"),
    supabase.from("teachers").select("id, name"),
  ]);

  if (!student) notFound();
  const s = student as Student;

  const [{ data: lessonRows }, { data: examRows }, { data: attendanceRows }] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, subject_id, teacher_id, taught_on, note")
      .eq("student_id", id)
      .order("taught_on", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("exams")
      .select("id, subject_id, exam_date, title")
      .eq("student_id", id)
      .order("exam_date"),
    supabase
      .from("attendance")
      .select("on_date, present")
      .eq("student_id", id)
      .order("on_date", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const subjectName = new Map(
    (subjectRows ?? []).map((x) => [x.id as string, x.name as string])
  );
  const teacherName = new Map(
    (teacherRows ?? []).map((t) => [t.id as string, t.name as string])
  );

  const entries: HistoryEntry[] = (lessonRows ?? []).map((l) => ({
    id: l.id as string,
    date: l.taught_on as string,
    subject: subjectName.get(l.subject_id as string) ?? "Unknown subject",
    teacher: teacherName.get(l.teacher_id as string) ?? "another teacher",
    note: (l.note as string | null) ?? null,
    // RLS allows a teacher to change only their own rows. Deciding it here too
    // means the UI does not offer an action the database will refuse.
    mine: l.teacher_id === userId,
  }));

  const attendance = (attendanceRows ?? []).map((a) => ({
    date: a.on_date as string,
    present: a.present as boolean,
  }));

  const exams = (examRows ?? []).map((e) => ({
    id: e.id as string,
    date: e.exam_date as string,
    subject: e.subject_id ? (subjectName.get(e.subject_id as string) ?? null) : null,
    title: (e.title as string | null) ?? null,
  }));

  return (
    <>
      <TopBar eyebrow={gradeLabel(s.grade)} title={s.name} />
      <main className="wrap stack" style={{ paddingTop: 12 }}>
        <div className="between">
          <span className="eyebrow">
            {s.school ? s.school : "No school recorded"}
            {!s.active && " · retired"}
          </span>
          <Link href="/students" className="eyebrow" style={{ textDecoration: "underline" }}>
            ← All students
          </Link>
        </div>

        <StudentHistory
          studentName={s.name}
          entries={entries}
          exams={exams}
          attendance={attendance}
          capped={entries.length === HISTORY_LIMIT}
        />
      </main>
      <Nav />
    </>
  );
}
