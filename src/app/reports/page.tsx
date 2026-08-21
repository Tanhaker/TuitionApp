import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import Nav from "@/components/Nav";
import CsvButton from "@/components/CsvButton";
import DownloadTextButton from "@/components/DownloadTextButton";
import ShareTextButton from "@/components/ShareTextButton";
import ReportDayPicker from "@/components/ReportDayPicker";
import { daysBetween, isISO, prettyDate, shiftDate, todayISO } from "@/lib/dates";
import { buildTextReport, type ReportStudent } from "@/lib/report-text";
import type { Subject, Student } from "@/lib/types";
import { gradeLabel, gradeShort } from "@/lib/grades";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; scope?: string; by?: string; on?: string }>;
}) {
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const scope = sp.scope === "all" ? "all" : "mine";
  // `scope` picks WHICH STUDENTS. `by` picks WHOSE LESSONS. They are different
  // questions: a student can be on your list but taught entirely by someone
  // else that week, because teachers swap students around.
  const by = sp.by === "all" ? "all" : "me";

  const supabase = await createClient();
  const userId = await requireUserId();

  const today = todayISO();

  // `on` switches the report to a single day, for the daily send. It wins over
  // the 7/30/90 window when present. Clamped to today: there is nothing to
  // report from the future.
  const onParam = sp.on && isISO(sp.on) ? (sp.on > today ? today : sp.on) : null;
  const singleDay = onParam !== null;
  const to = onParam ?? today;
  const from = singleDay ? to : shiftDate(to, -days);

  const [{ data: subjectRows }, { data: links }, { data: teachers }] = await Promise.all([
    supabase.from("subjects").select("*").eq("active", true).order("sort_order"),
    supabase.from("teacher_students").select("student_id").eq("teacher_id", userId),
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

  let inRangeQ = supabase
    .from("lessons")
    .select("student_id, subject_id, teacher_id, taught_on, note")
    .gte("taught_on", from)
    .lte("taught_on", to)
    .in("student_id", ids)
    .order("taught_on");

  let everQ = supabase
    .from("lessons")
    .select("student_id, subject_id, taught_on")
    .gte("taught_on", shiftDate(to, -365))
    .lte("taught_on", to)
    .in("student_id", ids);

  if (by === "me") {
    // "Last taught" must mean "last taught BY ME" here, or the gap colours would
    // claim a subject is covered when a colleague covered it, not you.
    inRangeQ = inRangeQ.eq("teacher_id", userId);
    everQ = everQ.eq("teacher_id", userId);
  }

  const [{ data: inRange }, { data: everLessons }] = await Promise.all([inRangeQ, everQ]);

  const teacherName = new Map((teachers ?? []).map((t) => [t.id as string, t.name as string]));
  const myName = teacherName.get(userId) ?? "Teacher";

  const lastTaught = new Map<string, string>();
  for (const l of everLessons ?? []) {
    const key = `${l.student_id}|${l.subject_id}`;
    const prev = lastTaught.get(key);
    if (!prev || (l.taught_on as string) > prev) lastTaught.set(key, l.taught_on as string);
  }

  const countInRange = new Map<string, number>();
  const lastInRange = new Map<string, string>();
  // Chapters covered in this window, in teaching order, de-duplicated: a chapter
  // running across three sessions should read once, not three times.
  const chapters = new Map<string, string[]>();
  for (const l of inRange ?? []) {
    const key = `${l.student_id}|${l.subject_id}`;
    countInRange.set(key, (countInRange.get(key) ?? 0) + 1);
    lastInRange.set(key, l.taught_on as string);
    const note = (l.note as string | null)?.trim();
    if (note) {
      const arr = chapters.get(key) ?? [];
      if (!arr.includes(note)) arr.push(note);
      chapters.set(key, arr);
    }
  }

  const csvRows = (inRange ?? []).map((l) => ({
    date: l.taught_on as string,
    student: students.find((s) => s.id === l.student_id)?.name ?? "",
    grade: gradeShort(students.find((s) => s.id === l.student_id)?.grade ?? 0),
    subject: subjects.find((s) => s.id === l.subject_id)?.name ?? "",
    chapter: (l.note as string | null) ?? "",
    teacher: teacherName.get(l.teacher_id as string) ?? "",
  }));

  /** Everything needed to render one student's card, computed once. */
  const cards = students.map((s) => {
    const cells = subjects
      .filter((sub) => s.grade >= sub.min_grade && s.grade <= sub.max_grade)
      .map((sub) => {
        const key = `${s.id}|${sub.id}`;
        const last = lastTaught.get(key) ?? null;
        const gap = last ? daysBetween(last, to) : null;
        const level = gap === null ? "bad" : gap <= 7 ? "ok" : gap <= 14 ? "warn" : "bad";
        return {
          sub,
          last,
          gap,
          level,
          count: countInRange.get(key) ?? 0,
          lastInWindow: lastInRange.get(key) ?? null,
          chapters: chapters.get(key) ?? [],
        };
      });
    return { student: s, cells, total: cells.reduce((n, c) => n + c.count, 0) };
  });

  // A student with no lessons in the window is not part of the record of what
  // was taught — they are named separately instead of padding the report with
  // empty entries.
  const taught = cards.filter((c) => c.total > 0);
  const notTaught = cards.filter((c) => c.total === 0);

  const textReport = buildTextReport(
    {
      teacherName: myName,
      from,
      to,
      mine: by === "me",
      singleDay,
      notTaught: notTaught.map((c) => c.student.name),
    },
    taught.map<ReportStudent>((c) => ({
      name: c.student.name,
      grade: c.student.grade,
      school: c.student.school,
      total: c.total,
      subjects: c.cells
        .filter((cell) => cell.count > 0)
        .map((cell) => ({
          name: cell.sub.name,
          count: cell.count,
          chapters: cell.chapters,
          last: cell.lastInWindow,
        })),
    }))
  );

  const link = (d: number, sc: string, b: string) => `/reports?days=${d}&scope=${sc}&by=${b}`;
  const dayLink = (d: string, sc: string, b: string) => `/reports?on=${d}&scope=${sc}&by=${b}`;
  const stamp = singleDay ? to : `${from}-to-${today}`;

  return (
    <>
      <TopBar eyebrow="Coverage" title="Reports" />
      <main className="wrap stack" style={{ paddingTop: 12 }}>
        {/* Three stacked rows of buttons used to eat the top of the screen
            before any report was visible. <details> collapses them behind one
            line and needs no JavaScript, so it works in the loading state too. */}
        <details className="filters">
          <summary>
            <span className="mono">
              {singleDay ? prettyDate(to) : `${days} days`} · {scope === "mine" ? "my students" : "everyone"} ·{" "}
              {by === "me" ? "taught by me" : "any teacher"}
            </span>
            <span className="chev" aria-hidden="true">
              ⌄
            </span>
          </summary>
          <div className="filters-body">
        <div className="tabs">
          <Link href={dayLink(today, scope, by)} style={{ flex: 1 }}>
            <button data-active={singleDay} style={{ width: "100%" }}>
              One day
            </button>
          </Link>
          {[7, 30, 90].map((d) => (
            <Link key={d} href={link(d, scope, by)} style={{ flex: 1 }}>
              <button data-active={!singleDay && days === d} style={{ width: "100%" }}>
                {d} days
              </button>
            </Link>
          ))}
        </div>
          </div>
        </details>

        {singleDay && <ReportDayPicker on={to} scope={scope} by={by} />}

        <div className="tabs" style={{ marginTop: -4 }}>
          <Link href={link(days, "mine", by)} style={{ flex: 1 }}>
            <button data-active={scope === "mine"} style={{ width: "100%" }}>
              My students
            </button>
          </Link>
          <Link href={link(days, "all", by)} style={{ flex: 1 }}>
            <button data-active={scope === "all"} style={{ width: "100%" }}>
              Everyone
            </button>
          </Link>
        </div>

        <div className="tabs" style={{ marginTop: -4 }}>
          <Link href={link(days, scope, "me")} style={{ flex: 1 }}>
            <button data-active={by === "me"} style={{ width: "100%" }}>
              Taught by me
            </button>
          </Link>
          <Link href={link(days, scope, "all")} style={{ flex: 1 }}>
            <button data-active={by === "all"} style={{ width: "100%" }}>
              Any teacher
            </button>
          </Link>
        </div>

        <div className="between" style={{ flexWrap: "wrap", gap: 8 }}>
          <span className="eyebrow">
            {singleDay ? prettyDate(to) : `${prettyDate(from)} → ${prettyDate(to)}`} ·{" "}
            {csvRows.length} lessons
          </span>
          <div className="between" style={{ gap: 6, flexWrap: "wrap" }}>
            <ShareTextButton
              text={textReport}
              title={singleDay ? `Register ${to}` : `Register ${from} to ${to}`}
              disabled={taught.length === 0}
            />
            <DownloadTextButton
              text={textReport}
              filename={`tuition-register-${stamp}.txt`}
              disabled={taught.length === 0}
            />
            <CsvButton rows={csvRows} filename={`tuition-log-${stamp}.csv`} />
          </div>
        </div>

        {taught.length === 0 ? (
          <div className="empty">
            {singleDay
              ? by === "me"
                ? "You logged no lessons on this day."
                : "No lessons were logged on this day."
              : by === "me"
                ? "You have not logged any lessons in this period."
                : "No lessons were logged in this period."}
          </div>
        ) : (
          <div className="register">
            {taught.map(({ student: s, cells, total }) => (
              <article className="row" key={s.id}>
                <header>
                  <span className="name">{s.name}</span>
                  <span className="grade">{gradeLabel(s.grade)}</span>
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
            ))}
          </div>
        )}

        {notTaught.length > 0 && (
          <div className="card stack">
            <span className="eyebrow">
              {by === "me"
                ? singleDay
                  ? "On your list, not taught by you today"
                  : "On your list, not taught by you"
                : "No lessons in this period"}
            </span>
            <div className="gapbar">
              {notTaught.map((c) => (
                <span className="gap" key={c.student.id} data-level="bad">
                  {c.student.name} · {gradeLabel(c.student.grade)}
                </span>
              ))}
            </div>
            <p className="hint">
              These are left out of both exports, because nothing was taught to
              record. They are listed here so a gap is still visible.
            </p>
          </div>
        )}

        <p className="hint">
          Green means taught within a week, amber within two, red means over two
          weeks or never. The number in brackets is how many sessions in this
          window. <strong>Taught by me</strong> counts only your own lessons —
          use it when a student is shared with another teacher.
        </p>
      </main>
      <Nav />
    </>
  );
}
