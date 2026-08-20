import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import Nav from "@/components/Nav";
import StudentManager from "@/components/StudentManager";
import type { Subject, Student, Exam } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const supabase = await createClient();
  const userId = await requireUserId();

  const [{ data: students }, { data: subjects }, { data: links }, { data: exams }] =
    await Promise.all([
      // Retired students are included: this is the only screen that can bring
      // one back, and "retire, never delete" is meaningless if retiring is a
      // one-way door.
      supabase
        .from("students")
        .select("id, name, grade, school, active")
        .order("active", { ascending: false })
        .order("grade")
        .order("name"),
      supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
      supabase.from("teacher_students").select("student_id").eq("teacher_id", userId),
      supabase
        .from("exams")
        .select("id, student_id, subject_id, exam_date, title")
        .order("exam_date"),
    ]);

  return (
    <>
      <TopBar eyebrow="Tuition list" title="Students" />
      <main className="wrap">
        <StudentManager
          students={(students ?? []) as Student[]}
          subjects={(subjects ?? []) as Subject[]}
          exams={(exams ?? []) as Exam[]}
          myIds={(links ?? []).map((l) => l.student_id as string)}
        />
      </main>
      <Nav />
    </>
  );
}
