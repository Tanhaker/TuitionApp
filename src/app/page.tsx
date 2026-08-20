import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayISO, shiftDate } from "@/lib/dates";
import type { Subject, Student } from "@/lib/types";
import TopBar from "@/components/TopBar";
import Nav from "@/components/Nav";
import LogGrid, { type RowData } from "@/components/LogGrid";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date ?? todayISO();
  const scope = sp.scope === "all" ? "all" : "mine";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: teacher }, { data: subjectRows }, { data: links }, { data: subjectLinks }] =
    await Promise.all([
      supabase.from("teachers").select("name").eq("id", user.id).maybeSingle(),
      supabase
        .from("subjects")
        .select("*")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("teacher_students")
        .select("student_id")
        .eq("teacher_id", user.id),
      supabase
        .from("teacher_subjects")
        .select("subject_id")
        .eq("teacher_id", user.id),
    ]);

  // teacher_subjects narrows the chips to what this teacher actually takes.
  // No rows = show everything, which is the right default for someone teaching
  // a whole class rather than one subject across several.
  const mySubjectIds = new Set((subjectLinks ?? []).map((r) => r.subject_id as string));
  const subjects = ((subjectRows ?? []) as Subject[]).filter(
    (s) => mySubjectIds.size === 0 || mySubjectIds.has(s.id)
  );
  const myIds = new Set((links ?? []).map((l) => l.student_id as string));

  let studentQuery = supabase
    .from("students")
    .select("id, name, grade, school, active")
    .eq("active", true)
    .order("grade")
    .order("name");

  if (scope === "mine") {
    if (myIds.size === 0) {
      return (
        <>
          <TopBar eyebrow="Daily register" title={teacher?.name ?? "Today"} />
          <main className="wrap" style={{ paddingTop: 20 }}>
            <div className="empty">
              No students on your list yet.
              <br />
              <Link href="/students" className="mono" style={{ textDecoration: "underline" }}>
                Add your students →
              </Link>
            </div>
          </main>
          <Nav />
        </>
      );
    }
    studentQuery = studentQuery.in("id", [...myIds]);
  }

  const { data: studentRows } = await studentQuery;
  const students = (studentRows ?? []) as Student[];
  const ids = students.map((s) => s.id);

  const historyFrom = shiftDate(date, -75);

  const [{ data: todayLessons }, { data: history }, { data: exams }, { data: teachers }] =
    await Promise.all([
      supabase
        .from("lessons")
        .select("student_id, subject_id, teacher_id, note")
        .eq("taught_on", date)
        .in("student_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabase
        .from("lessons")
        .select("student_id, subject_id, taught_on, note")
        .gte("taught_on", historyFrom)
        .lt("taught_on", date)
        .in("student_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabase
        .from("exams")
        .select("student_id, subject_id, exam_date, title")
        .gte("exam_date", date)
        .in("student_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"])
        .order("exam_date"),
      supabase.from("teachers").select("id, name"),
    ]);

  const teacherName = new Map((teachers ?? []).map((t) => [t.id as string, t.name as string]));

  const mineToday = new Set<string>();
  // The chapter this teacher recorded against today's lesson, if any.
  const myNoteToday = new Map<string, string>();
  const othersToday = new Map<string, Set<string>>();
  for (const l of todayLessons ?? []) {
    const key = `${l.student_id}|${l.subject_id}`;
    if (l.teacher_id === user.id) {
      mineToday.add(key);
      if (l.note) myNoteToday.set(key, l.note as string);
    } else {
      const set = othersToday.get(l.student_id as string) ?? new Set<string>();
      set.add(teacherName.get(l.teacher_id as string) ?? "another teacher");
      othersToday.set(l.student_id as string, set);
    }
  }

  const lastTaught = new Map<string, string>();
  // The chapter recorded the last time this subject was taught, so a teacher
  // picking the subject up again can see where it was left off.
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

  const rows: RowData[] = students.map((s) => ({
    student: s,
    subjects: subjects
      .filter((sub) => s.grade >= sub.min_grade && s.grade <= sub.max_grade)
      .map((sub) => ({
        id: sub.id,
        name: sub.name,
        on: mineToday.has(`${s.id}|${sub.id}`),
        lastTaught: lastTaught.get(`${s.id}|${sub.id}`) ?? null,
        examDate: nextExam.get(`${s.id}|${sub.id}`) ?? null,
        note: myNoteToday.get(`${s.id}|${sub.id}`) ?? null,
        lastNote: lastNote.get(`${s.id}|${sub.id}`) ?? null,
      })),
    alsoToday: [...(othersToday.get(s.id) ?? [])],
  }));

  return (
    <>
      <TopBar eyebrow="Daily register" title={teacher?.name ?? "Today"} />
      <main className="wrap">
        <LogGrid rows={rows} date={date} scope={scope} />
      </main>
      <Nav />
    </>
  );
}
