/**
 * Smoke test — exercises the database against a real Supabase project.
 *
 *   node scripts/smoke.mjs teacher@example.com 'their-password'
 *
 * Signs in as a real teacher over the anon key, so every statement runs under
 * the same RLS policies the app runs under. If this passes, the schema and the
 * policies agree with what src/app/actions.ts expects.
 *
 * It writes to your real database and cleans up after itself: everything it
 * creates is tagged with the marker below and removed in the final step, even
 * if an earlier check fails. Student rows are hard-deleted here rather than
 * retired — that is the one place this script deliberately differs from the
 * app, because leaving test children on a shared roster would be worse.
 *
 * Run it against a scratch project if you would rather not touch live data.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const MARKER = "zz-smoke";
const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("usage: node scripts/smoke.mjs <teacher-email> <password>");
  process.exit(2);
}

// --- env ------------------------------------------------------------------
function readEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local: fall back to the real environment */
  }
  return env;
}

const env = readEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon || url.includes("placeholder")) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
  process.exit(2);
}
if (/service_role|sb_secret_/.test(anon)) {
  console.error("That looks like a service-role key. This app runs under RLS — use the anon key.");
  process.exit(2);
}

// --- tiny harness ---------------------------------------------------------
let passed = 0;
let failed = 0;
const failures = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    failed++;
    failures.push({ name, message: e?.message ?? String(e) });
    console.log(`  FAIL  ${name}\n          ${e?.message ?? e}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/** Supabase returns errors as values; turn them into throws for the harness. */
function ok({ data, error }, context) {
  if (error) throw new Error(`${context}: ${error.message}${error.code ? ` [${error.code}]` : ""}`);
  return data;
}

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const shift = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

// --- run ------------------------------------------------------------------
const supabase = createClient(url, anon);
const created = { students: [], subjects: [] };
let me = null;

console.log(`\nSmoke test against ${url}\n`);

try {
  // ---------------------------------------------------------------- auth
  await check("sign in with the anon key", async () => {
    const data = ok(await supabase.auth.signInWithPassword({ email, password }), "signIn");
    me = data.user.id;
    return data.user.email;
  });

  if (!me) {
    console.error("\nCannot continue without a session.\n");
    process.exit(1);
  }

  await check("teachers row exists for this user (handle_new_user trigger)", async () => {
    const row = ok(
      await supabase.from("teachers").select("id, name").eq("id", me).maybeSingle(),
      "select teachers"
    );
    assert(row, "no teachers row — the on_auth_user_created trigger did not fire for this user");
    return row.name;
  });

  // ------------------------------------------------------------ schema
  for (const table of [
    "teachers",
    "subjects",
    "students",
    "teacher_students",
    "teacher_subjects",
    "lessons",
    "exams",
  ]) {
    await check(`table ${table} is readable`, async () => {
      const { error, count } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(`${error.message} [${error.code ?? "?"}]`);
      return `${count ?? 0} rows`;
    });
  }

  // ----------------------------------------------------------- subjects
  let subjectId = null;

  await check("insert a subject", async () => {
    const row = ok(
      await supabase
        .from("subjects")
        .insert({ name: `${MARKER}-maths`, min_grade: 1, max_grade: 12, sort_order: 9999 })
        .select("id, name")
        .single(),
      "insert subject"
    );
    subjectId = row.id;
    created.subjects.push(row.id);
    return row.name;
  });

  await check("subject names are unique case-insensitively", async () => {
    const { error } = await supabase
      .from("subjects")
      .insert({ name: `${MARKER}-MATHS`, min_grade: 1, max_grade: 12, sort_order: 9999 });
    assert(error, "a differently-cased duplicate was accepted — subjects_name_lower_uniq is missing");
    assert(
      error.code === "23505",
      `expected unique violation 23505, got ${error.code}: ${error.message}`
    );
    return "rejected as expected";
  });

  await check("teacher_subjects link round-trips", async () => {
    ok(
      await supabase
        .from("teacher_subjects")
        .upsert(
          { teacher_id: me, subject_id: subjectId },
          { onConflict: "teacher_id,subject_id" }
        ),
      "insert teacher_subjects"
    );
    const rows = ok(
      await supabase
        .from("teacher_subjects")
        .select("subject_id")
        .eq("teacher_id", me)
        .eq("subject_id", subjectId),
      "select teacher_subjects"
    );
    assert(rows.length === 1, `expected 1 link, got ${rows.length}`);
    ok(
      await supabase
        .from("teacher_subjects")
        .delete()
        .eq("teacher_id", me)
        .eq("subject_id", subjectId),
      "delete teacher_subjects"
    );
    return "insert + delete";
  });

  await check("teacher_subjects rejects a link for another teacher (RLS)", async () => {
    const other = "00000000-0000-0000-0000-000000000001";
    const { error } = await supabase
      .from("teacher_subjects")
      .insert({ teacher_id: other, subject_id: subjectId });
    assert(error, "RLS allowed writing a subject link for a different teacher");
    return `blocked: ${error.code ?? error.message}`;
  });

  // ----------------------------------------------------------- students
  let studentId = null;

  await check("insert a student", async () => {
    const row = ok(
      await supabase
        .from("students")
        .insert({ name: `${MARKER}-aarav`, grade: 5, school: `${MARKER}-school`, created_by: me })
        .select("id, name")
        .single(),
      "insert student"
    );
    studentId = row.id;
    created.students.push(row.id);
    return row.name;
  });

  await check("duplicate active student in the same class is rejected", async () => {
    const { error } = await supabase
      .from("students")
      .insert({ name: `${MARKER}-AARAV`, grade: 5, created_by: me });
    assert(error, "a duplicate child was accepted — students_name_grade_uniq is missing");
    assert(error.code === "23505", `expected 23505, got ${error.code}: ${error.message}`);
    return "rejected as expected";
  });

  await check("teacher_students link round-trips", async () => {
    ok(
      await supabase
        .from("teacher_students")
        .upsert(
          { teacher_id: me, student_id: studentId },
          { onConflict: "teacher_id,student_id" }
        ),
      "insert teacher_students"
    );
    const rows = ok(
      await supabase.from("teacher_students").select("student_id").eq("teacher_id", me),
      "select teacher_students"
    );
    assert(
      rows.some((r) => r.student_id === studentId),
      "the link was written but did not come back"
    );
    return `${rows.length} students on this teacher's list`;
  });

  // ------------------------------------------------------------ lessons
  await check("log a lesson", async () => {
    ok(
      await supabase.from("lessons").insert({
        student_id: studentId,
        subject_id: subjectId,
        teacher_id: me,
        taught_on: today(),
      }),
      "insert lesson"
    );
    return today();
  });

  await check("logging the same lesson twice is rejected (23505)", async () => {
    const { error } = await supabase.from("lessons").insert({
      student_id: studentId,
      subject_id: subjectId,
      teacher_id: me,
      taught_on: today(),
    });
    assert(error, "the unique constraint on lessons is missing");
    assert(error.code === "23505", `expected 23505, got ${error.code}: ${error.message}`);
    return "toggleLesson relies on this";
  });

  await check("lessons cannot be logged for another teacher (RLS)", async () => {
    const other = "00000000-0000-0000-0000-000000000001";
    const { error } = await supabase.from("lessons").insert({
      student_id: studentId,
      subject_id: subjectId,
      teacher_id: other,
      taught_on: shift(today(), -1),
    });
    assert(error, "RLS allowed writing a lesson attributed to a different teacher");
    return `blocked: ${error.code ?? error.message}`;
  });

  await check("undo a lesson (delete own row)", async () => {
    ok(
      await supabase
        .from("lessons")
        .delete()
        .eq("student_id", studentId)
        .eq("subject_id", subjectId)
        .eq("teacher_id", me)
        .eq("taught_on", today()),
      "delete lesson"
    );
    const rows = ok(
      await supabase
        .from("lessons")
        .select("id")
        .eq("student_id", studentId)
        .eq("taught_on", today()),
      "verify delete"
    );
    assert(rows.length === 0, `expected the row to be gone, found ${rows.length}`);
    return "gone";
  });

  // -------------------------------------------------------------- exams
  await check("set an exam date", async () => {
    ok(
      await supabase.from("exams").insert({
        student_id: studentId,
        subject_id: subjectId,
        exam_date: shift(today(), 10),
        title: `${MARKER}-term`,
        created_by: me,
      }),
      "insert exam"
    );
    return shift(today(), 10);
  });

  await check("upcoming exams read back in date order", async () => {
    const rows = ok(
      await supabase
        .from("exams")
        .select("student_id, subject_id, exam_date")
        .gte("exam_date", today())
        .eq("student_id", studentId)
        .order("exam_date"),
      "select exams"
    );
    assert(rows.length >= 1, "the exam did not come back");
    return `${rows.length} upcoming`;
  });

  // ------------------------------------------------------------- guards
  await check("subject in use cannot be deleted (on delete restrict)", async () => {
    ok(
      await supabase.from("lessons").insert({
        student_id: studentId,
        subject_id: subjectId,
        teacher_id: me,
        taught_on: shift(today(), -2),
      }),
      "insert lesson for restrict check"
    );
    const { error } = await supabase.from("subjects").delete().eq("id", subjectId);
    assert(error, "a subject with lessons against it was deleted — history would be lost");
    assert(
      error.code === "23503",
      `expected foreign-key violation 23503, got ${error.code}: ${error.message}`
    );
    return "retire, never delete";
  });

  await check("empty .in() guard uses a UUID that matches nothing", async () => {
    const { data, error } = await supabase
      .from("lessons")
      .select("id")
      .in("student_id", ["00000000-0000-0000-0000-000000000000"]);
    assert(!error, `the sentinel UUID was rejected: ${error?.message}`);
    assert(data.length === 0, `sentinel matched ${data.length} rows, expected 0`);
    return "0 rows, no error";
  });

  await check('the string "none" is NOT a usable sentinel', async () => {
    const { error } = await supabase.from("lessons").select("id").in("student_id", ["none"]);
    assert(error, 'Postgres accepted "none" as a uuid — this check is now obsolete');
    return `rejected as expected: ${error.code ?? error.message}`;
  });
} finally {
  // ------------------------------------------------------------- cleanup
  console.log("\n  cleaning up…");

  if (created.students.length) {
    await supabase.from("lessons").delete().in("student_id", created.students);
    await supabase.from("exams").delete().in("student_id", created.students);
    await supabase.from("teacher_students").delete().in("student_id", created.students);
  }
  if (created.subjects.length) {
    await supabase.from("lessons").delete().in("subject_id", created.subjects);
    await supabase.from("teacher_subjects").delete().in("subject_id", created.subjects);
  }
  if (created.students.length) {
    await supabase.from("students").delete().in("id", created.students);
  }
  if (created.subjects.length) {
    await supabase.from("subjects").delete().in("id", created.subjects);
  }

  // Anything left behind from an earlier interrupted run.
  await supabase.from("students").delete().like("name", `${MARKER}%`);
  await supabase.from("subjects").delete().like("name", `${MARKER}%`);

  const { data: leftoverStudents } = await supabase
    .from("students")
    .select("id")
    .like("name", `${MARKER}%`);
  const { data: leftoverSubjects } = await supabase
    .from("subjects")
    .select("id")
    .like("name", `${MARKER}%`);

  const leftover = (leftoverStudents?.length ?? 0) + (leftoverSubjects?.length ?? 0);
  console.log(
    leftover === 0
      ? "  cleanup complete — nothing left behind"
      : `  WARNING: ${leftover} test row(s) could not be removed; search for "${MARKER}"`
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failures.length) {
    console.log("Failures:");
    for (const f of failures) console.log(`  - ${f.name}\n      ${f.message}`);
    console.log("");
  }

  await supabase.auth.signOut();
  process.exit(failed > 0 ? 1 : 0);
}
