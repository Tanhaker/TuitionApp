"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isISO, todayISO } from "@/lib/dates";

/**
 * Every database write in the app lives in this file.
 *
 * These run as the signed-in teacher under the anon key, so RLS decides what is
 * actually allowed — a teacher can delete their own lesson and nobody else's
 * because of the policy, not because of a check here. The guards below exist to
 * give a useful error message, not to provide security.
 */

type Supa = Awaited<ReturnType<typeof createClient>>;

async function requireUser(): Promise<{ supabase: Supa; userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

/** Routes that show lesson or roster data and go stale after a write. */
function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath("/reports");
  revalidatePath("/students");
  revalidatePath("/subjects");
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

// ---------------------------------------------------------------- lessons

/**
 * The result of a tap. A failure is a returned value, not a thrown error.
 *
 * Next sanitizes anything thrown out of a server action in a production build,
 * replacing the message with a generic digest string. Throwing here would mean
 * a teacher in a noisy room reads "An error occurred in the Server Components
 * render" instead of "Check your connection and tap again", so the message has
 * to travel back as data.
 */
export type ToggleResult = { ok: true; on: boolean } | { ok: false; error: string };

/**
 * One tap on the Today grid: log this subject for this student on this date, or
 * undo it if it is already logged.
 *
 * Returns the resulting state so LogGrid can settle its optimistic flip on the
 * truth rather than on an assumption. A tap that silently does nothing is worse
 * than an error message, so every failure path returns one.
 */
export async function toggleLesson(
  studentId: string,
  subjectId: string,
  date: string
): Promise<ToggleResult> {
  const { supabase, userId } = await requireUser();

  if (!isISO(date)) {
    return { ok: false, error: "That date is not valid. Pick a day from the date strip." };
  }
  if (date > todayISO()) {
    return { ok: false, error: "You cannot log a lesson for a future date." };
  }

  // Only ever touches this teacher's own row. Two teachers can each log the
  // same subject for the same child on the same day, which is intentional.
  const { data: existing, error: findError } = await supabase
    .from("lessons")
    .select("id")
    .eq("student_id", studentId)
    .eq("subject_id", subjectId)
    .eq("teacher_id", userId)
    .eq("taught_on", date)
    .maybeSingle();

  if (findError) {
    return {
      ok: false,
      error: "Could not reach the register. Check your connection and tap again.",
    };
  }

  if (existing) {
    const { error } = await supabase.from("lessons").delete().eq("id", existing.id);
    if (error) return { ok: false, error: "Could not undo that. Tap again." };
    revalidateAll();
    return { ok: true, on: false };
  }

  const { error } = await supabase.from("lessons").insert({
    student_id: studentId,
    subject_id: subjectId,
    teacher_id: userId,
    taught_on: date,
  });

  if (error) {
    // 23505 = unique violation. It was already logged, so the tap was a no-op
    // rather than a failure: report it as on.
    if (error.code === "23505") {
      revalidateAll();
      return { ok: true, on: true };
    }
    return {
      ok: false,
      error: "Could not save that lesson. Check your connection and tap again.",
    };
  }

  revalidateAll();
  return { ok: true, on: true };
}

/** Attach or clear a note on a lesson this teacher already logged. */
export async function setLessonNote(
  studentId: string,
  subjectId: string,
  date: string,
  note: string
) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("lessons")
    .update({ note: clean(note) })
    .eq("student_id", studentId)
    .eq("subject_id", subjectId)
    .eq("teacher_id", userId)
    .eq("taught_on", date);
  if (error) throw new Error("Could not save that note.");
  revalidatePath("/");
}

// --------------------------------------------------------------- students

export async function addStudent(input: {
  name: string;
  grade: number;
  school?: string | null;
}) {
  const { supabase, userId } = await requireUser();

  const name = clean(input.name);
  if (!name) throw new Error("Enter the student's name.");
  if (!Number.isInteger(input.grade) || input.grade < 1 || input.grade > 12) {
    throw new Error("Pick a class between 1 and 12.");
  }

  const { data, error } = await supabase
    .from("students")
    .insert({ name, grade: input.grade, school: clean(input.school), created_by: userId })
    .select("id")
    .single();

  if (error) {
    // The partial unique index on (lower(trim(name)), grade) where active.
    // Students are shared tuition-wide, so this means another teacher already
    // added the same child — not a mistake this teacher made.
    if (error.code === "23505") {
      throw new Error(
        name +
          " is already on the tuition list for Class " +
          input.grade +
          '. Find them below and tap "Add to my list".'
      );
    }
    throw new Error("Could not add that student.");
  }

  // Whoever adds a student is presumably teaching them.
  await supabase.from("teacher_students").insert({ teacher_id: userId, student_id: data.id });

  revalidateAll();
  return { id: data.id as string };
}

export async function updateStudent(
  studentId: string,
  patch: { name?: string; grade?: number; school?: string | null }
) {
  const { supabase } = await requireUser();

  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = clean(patch.name);
    if (!name) throw new Error("The name cannot be empty.");
    fields.name = name;
  }
  if (patch.grade !== undefined) {
    if (!Number.isInteger(patch.grade) || patch.grade < 1 || patch.grade > 12) {
      throw new Error("Pick a class between 1 and 12.");
    }
    fields.grade = patch.grade;
  }
  if (patch.school !== undefined) fields.school = clean(patch.school);
  if (Object.keys(fields).length === 0) return;

  const { error } = await supabase.from("students").update(fields).eq("id", studentId);
  if (error) {
    if (error.code === "23505") {
      throw new Error("Another student in that class already has this name.");
    }
    throw new Error("Could not save those changes.");
  }
  revalidateAll();
}

/**
 * Retire, never delete. Their lesson history stays intact and still shows in
 * past reports; they simply stop appearing on Today and Plan.
 */
export async function retireStudent(studentId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("students").update({ active: false }).eq("id", studentId);
  if (error) throw new Error("Could not retire that student.");
  revalidateAll();
}

export async function restoreStudent(studentId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("students").update({ active: true }).eq("id", studentId);
  if (error) throw new Error("Could not restore that student.");
  revalidateAll();
}

/** Mark a shared student as one you teach, or take them off your list. */
export async function setMyStudent(studentId: string, mine: boolean) {
  const { supabase, userId } = await requireUser();

  if (mine) {
    const { error } = await supabase
      .from("teacher_students")
      .upsert(
        { teacher_id: userId, student_id: studentId },
        { onConflict: "teacher_id,student_id" }
      );
    if (error) throw new Error("Could not add them to your list.");
  } else {
    const { error } = await supabase
      .from("teacher_students")
      .delete()
      .eq("teacher_id", userId)
      .eq("student_id", studentId);
    if (error) throw new Error("Could not remove them from your list.");
  }

  revalidateAll();
  return { mine };
}

// ------------------------------------------------------------------ exams

/**
 * Set the next exam date for one student and subject.
 *
 * Replaces any upcoming exam for that pair rather than stacking a second one:
 * a subject has one next paper. Past exams are left alone so the history a
 * report shows stays true.
 */
export async function setExam(input: {
  studentId: string;
  subjectId: string | null;
  examDate: string;
  title?: string | null;
}) {
  const { supabase, userId } = await requireUser();

  if (!isISO(input.examDate)) throw new Error("Pick a valid exam date.");

  const today = todayISO();
  let del = supabase.from("exams").delete().eq("student_id", input.studentId).gte("exam_date", today);
  del = input.subjectId ? del.eq("subject_id", input.subjectId) : del.is("subject_id", null);

  const { error: delError } = await del;
  if (delError) throw new Error("Could not update that exam date.");

  const { error } = await supabase.from("exams").insert({
    student_id: input.studentId,
    subject_id: input.subjectId,
    exam_date: input.examDate,
    title: clean(input.title),
    created_by: userId,
  });
  if (error) throw new Error("Could not save that exam date.");

  revalidateAll();
}

export async function removeExam(examId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("exams").delete().eq("id", examId);
  if (error) throw new Error("Could not remove that exam.");
  revalidateAll();
}

/**
 * Copy one student's upcoming exam timetable onto their classmates.
 *
 * The point of the button: a whole batch from the same school sits the same
 * papers on the same days, and typing that in twelve times is how a teacher
 * stops using the app. A target's upcoming dates are replaced, so running it
 * twice is safe.
 */
export async function copyExamsToStudents(fromStudentId: string, toStudentIds: string[]) {
  const { supabase, userId } = await requireUser();

  const targets = toStudentIds.filter((id) => id && id !== fromStudentId);
  if (targets.length === 0) throw new Error("Pick at least one classmate to copy to.");

  const today = todayISO();

  const { data: source, error: readError } = await supabase
    .from("exams")
    .select("subject_id, exam_date, title")
    .eq("student_id", fromStudentId)
    .gte("exam_date", today);

  if (readError) throw new Error("Could not read that timetable.");
  if (!source || source.length === 0) {
    throw new Error("That student has no upcoming exams to copy.");
  }

  // Clear the targets' upcoming exams first, so a re-run replaces rather than
  // half-merging two different timetables.
  const { error: clearError } = await supabase
    .from("exams")
    .delete()
    .in("student_id", targets)
    .gte("exam_date", today);
  if (clearError) throw new Error("Could not replace the existing exam dates.");

  const rows = targets.flatMap((studentId) =>
    source.map((e) => ({
      student_id: studentId,
      subject_id: e.subject_id,
      exam_date: e.exam_date,
      title: e.title,
      created_by: userId,
    }))
  );

  const { error } = await supabase.from("exams").insert(rows);
  if (error) throw new Error("Could not copy those exam dates.");

  revalidateAll();
  return { copied: source.length, to: targets.length };
}

// --------------------------------------------------------------- subjects

export async function addSubject(input: { name: string; minGrade: number; maxGrade: number }) {
  const { supabase } = await requireUser();

  const name = clean(input.name);
  if (!name) throw new Error("Enter a subject name.");
  if (input.minGrade > input.maxGrade) {
    throw new Error("The lowest class cannot be higher than the highest class.");
  }

  const { data: last } = await supabase
    .from("subjects")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("subjects").insert({
    name,
    min_grade: input.minGrade,
    max_grade: input.maxGrade,
    sort_order: (last?.sort_order ?? 0) + 1,
  });

  if (error) {
    // Unique on lower(trim(name)): "maths" and "Maths" are the same subject.
    if (error.code === "23505") throw new Error(name + " is already on the subject list.");
    throw new Error("Could not add that subject.");
  }

  revalidateAll();
}

export async function updateSubject(
  subjectId: string,
  patch: { name?: string; minGrade?: number; maxGrade?: number }
) {
  const { supabase } = await requireUser();

  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = clean(patch.name);
    if (!name) throw new Error("The subject name cannot be empty.");
    fields.name = name;
  }
  if (patch.minGrade !== undefined) fields.min_grade = patch.minGrade;
  if (patch.maxGrade !== undefined) fields.max_grade = patch.maxGrade;

  const min = fields.min_grade as number | undefined;
  const max = fields.max_grade as number | undefined;
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error("The lowest class cannot be higher than the highest class.");
  }
  if (Object.keys(fields).length === 0) return;

  const { error } = await supabase.from("subjects").update(fields).eq("id", subjectId);
  if (error) {
    if (error.code === "23505") throw new Error("A subject with that name already exists.");
    throw new Error("Could not save that subject.");
  }
  revalidateAll();
}

/**
 * Retire, never delete. lessons.subject_id is `on delete restrict` on purpose:
 * deleting a subject would either destroy or orphan every lesson ever logged
 * against it, and "we stopped teaching Drawing in March" is a fact the reports
 * should keep.
 */
export async function retireSubject(subjectId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("subjects").update({ active: false }).eq("id", subjectId);
  if (error) throw new Error("Could not retire that subject.");
  revalidateAll();
}

export async function restoreSubject(subjectId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("subjects").update({ active: true }).eq("id", subjectId);
  if (error) throw new Error("Could not restore that subject.");
  revalidateAll();
}

/**
 * Which subjects this teacher wants to see. An empty selection means "show me
 * everything", which is the right default for a teacher who takes every subject
 * for one class.
 */
export async function setMySubjects(subjectIds: string[]) {
  const { supabase, userId } = await requireUser();

  const { error: clearError } = await supabase
    .from("teacher_subjects")
    .delete()
    .eq("teacher_id", userId);
  if (clearError) throw new Error("Could not save your subject list.");

  if (subjectIds.length > 0) {
    const { error } = await supabase
      .from("teacher_subjects")
      .insert(subjectIds.map((subject_id) => ({ teacher_id: userId, subject_id })));
    if (error) throw new Error("Could not save your subject list.");
  }

  revalidateAll();
}

// ------------------------------------------------------------------- auth

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
