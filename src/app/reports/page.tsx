import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import Nav from "@/components/Nav";
import CsvButton from "@/components/CsvButton";
import { daysBetween, prettyDate, shiftDate, todayISO } from "@/lib/dates";
import type { Subject, Student } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; scope?: string }>;
}) {
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const scope = sp.scope === "all" ? "all" : "mine";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todayISO();
  const from = shiftDate(today, -days);

  const [{ data: subjectRows }, { data: links }, { data: teachers }] = await Promise.all([
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    supabase.from("teacher_students").select("student_id").eq("teacher_id", user.id),
    supabase.from("teachers").select("id, name"),
  ]);

  const subjects = (subjectRows ?? []) as Subject[];
  const myIds = (links ?? []).map((l) => l.student_id as string);

  let q = supabase
    .from("students")
    .select("id, name, grade, school, active")
    .eq("active", true)
    .order("grade")
    .order("name");
  if (scope === "mine") {
    if (myIds.length === 0) {
      return (
        <>
          <TopBar eyebrow="Coverage" title="Reports" />
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
    q = q.in("id", myIds);
  }

  const { data: studentRows } = await q;
  const students = (studentRows ?? []) as Student[];
  // .in() with an empty array matches everything, so an empty roster needs a
  // sentinel that matches nothing. It has to be a valid UUID: Postgres rejects
  // "none" outright when comparing against a uuid column.
  const ids = students.length
    ? students.map((s) => s.id)
    : ["00000000-0000-0000-0000-000000000000"];

  const [{ data: inRange }, { data: everLessons }] = await Promise.all([
    supabase
      .from("lessons")
      .select("student_id, subject_id, teacher_id, taught_on, note")
      .gte("taught_on", from)
      .lte("taught_on", today)
      .in("student_id", ids),
    supabase
      .from("lessons")
      .select("student_id, subject_id, taught_on")
      .gte("taught_on", shiftDate(today, -365))
      .in("student_id", ids),
  ]);

  const teacherName = new Map((teachers ?? []).map((t) => [t.id as string, t.name as string]));

  const lastTaught = new Map<string, string>();
  for (const l of everLessons ?? []) {
    const key = `${l.student_id}|${l.subject_id}`;
    const prev = lastTaught.get(key);
    if (!prev || (l.taught_on as string) > prev) lastTaught.set(key, l.taught_on as string);
  }

  const countInRange = new Map<string, number>();
  // Chapters covered in this window, newest first, de-duplicated: the same
  // chapter often runs across two or three sessions and listing it three times
  // makes the report harder to read, not more accurate.
  const chapters = new Map<string, string[]>();
  for (const l of inRange ?? []) {
    const key = `${l.student_id}|${l.subject_id}`;
    countInRange.set(key, (countInRange.get(key) ?? 0) + 1);
    const note = (l.note as string | null)?.trim();
    if (note) {
      const list = chapters.get(key) ?? [];
      if (!list.includes(note)) list.push(note);
      chapters.set(key, list);
    }
  }

  const csvRows = (inRange ?? []).map((l) => ({
    date: l.taught_on as string,
    student: students.find((s) => s.id === l.student_id)?.name ?? "",
    grade: students.find((s) => s.id === l.student_id)?.grade ?? "",
    subject: subjects.find((s) => s.id === l.subject_id)?.name ?? "",
    chapter: (l.note as string | null) ?? "",
    teacher: teacherName.get(l.teacher_id as string) ?? "",
  }));

  const link = (d: number, sc: string) => `/reports?days=${d}&scope=${sc}`;

  return (
    <>
      <TopBar eyebrow="Coverage" title="Reports" />
      <main className="wrap stack" style={{ paddingTop: 12 }}>
        <div className="tabs">
          {[7, 30, 90].map((d) => (
            <Link key={d} href={link(d, scope)} style={{ flex: 1 }}>
              <button data-active={days === d} style={{ width: "100%" }}>
                {d} days
              </button>
            </Link>
          ))}
        </div>
        <div className="tabs" style={{ marginTop: -4 }}>
          <Link href={link(days, "mine")} style={{ flex: 1 }}>
            <button data-active={scope === "mine"} style={{ width: "100%" }}>
              My students
            </button>
          </Link>
          <Link href={link(days, "all")} style={{ flex: 1 }}>
            <button data-active={scope === "all"} style={{ width: "100%" }}>
              Everyone
            </button>
          </Link>
        </div>

        <div className="between">
          <span className="eyebrow">
            {prettyDate(from)} → {prettyDate(today)} · {csvRows.length} entries
          </span>
          <CsvButton rows={csvRows} filename={`tuition-log-${from}-to-${today}.csv`} />
        </div>

        <div className="register">
          {students.map((s) => {
            const cells = subjects
              .filter((sub) => s.grade >= sub.min_grade && s.grade <= sub.max_grade)
              .map((sub) => {
                const key = `${s.id}|${sub.id}`;
                const last = lastTaught.get(key) ?? null;
                const gap = last ? daysBetween(last, today) : null;
                const level =
                  gap === null ? "bad" : gap <= 7 ? "ok" : gap <= 14 ? "warn" : "bad";
                return {
                  sub,
                  last,
                  gap,
                  level,
                  count: countInRange.get(key) ?? 0,
                  chapters: chapters.get(key) ?? [],
                };
              });

            const total = cells.reduce((n, c) => n + c.count, 0);

            return (
              <article className="row" key={s.id}>
                <header>
                  <span className="name">{s.name}</span>
                  <span className="grade">Class {s.grade}</span>
                  <span className="meta">{total} sessions</span>
                </header>
                <div className="gapbar">
                  {cells.map((c) => (
                    <span className="gap" key={c.sub.id} data-level={c.level}>
                      {c.sub.name} ·{" "}
                      {c.gap === null ? "never" : c.gap === 0 ? "today" : `${c.gap}d ago`}
                      {c.count > 0 && ` (${c.count})`}
                    </span>
                  ))}
                </div>

                {cells.some((c) => c.chapters.length > 0) && (
                  <div className="chapters">
                    {cells
                      .filter((c) => c.chapters.length > 0)
                      .map((c) => (
                        <div className="chapter" key={c.sub.id} data-static="true">
                          <span className="subj">{c.sub.name}</span>
                          <span className="what">{c.chapters.join(" · ")}</span>
                        </div>
                      ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <p className="hint">
          Green means taught within a week, amber within two, red means over two
          weeks or never. The number in brackets is how many sessions in this
          window.
        </p>
      </main>
      <Nav />
    </>
  );
}
