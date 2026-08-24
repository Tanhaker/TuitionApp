import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import Nav from "@/components/Nav";
import DayStrip from "@/components/DayStrip";
import ShareTextButton from "@/components/ShareTextButton";
import { isISO, prettyDateLong, todayISO } from "@/lib/dates";
import { buildDayBoard, buildDayBoardText } from "@/lib/day-board";
import { gradeShort } from "@/lib/grades";

export const dynamic = "force-dynamic";

/**
 * One day, every teacher — the screen that replaces the evening WhatsApp round.
 *
 * Read-only on purpose. Logging stays on Today, where a teacher already has the
 * chips under their thumb; a second place to write the same thing is how two
 * records start disagreeing. This screen only reads back what everyone filed.
 */
export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ on?: string }>;
}) {
  const sp = await searchParams;
  const today = todayISO();
  // Clamped to today: there is nothing to read from the future, and a stray
  // ?on= from a shared link should land somewhere sensible rather than empty.
  const on = sp.on && isISO(sp.on) ? (sp.on > today ? today : sp.on) : today;

  const supabase = await createClient();
  const userId = await requireUserId();

  const [
    { data: teacherRows },
    { data: lessonRows },
    { data: attendanceRows },
    { data: subjectRows },
    { data: studentRows },
  ] = await Promise.all([
    supabase.from("teachers").select("id, name").order("name"),
    // Bounded by the day, not by a limit: one date across six teachers is at
    // most roster-sized, and a limit here would silently hide somebody's work.
    supabase
      .from("lessons")
      .select("student_id, subject_id, teacher_id, note")
      .eq("taught_on", on),
    supabase.from("attendance").select("student_id, present").eq("on_date", on),
    supabase.from("subjects").select("id, name"),
    // Not filtered to active: a lesson logged before a student was retired
    // still needs their name, or the board would show a blank row.
    supabase.from("students").select("id, name, grade"),
  ]);

  const subjectName = new Map((subjectRows ?? []).map((s) => [s.id as string, s.name as string]));
  const student = new Map(
    (studentRows ?? []).map((s) => [
      s.id as string,
      { name: s.name as string, grade: s.grade as number },
    ])
  );

  const board = buildDayBoard({
    date: on,
    teachers: (teacherRows ?? []).map((t) => ({ id: t.id as string, name: t.name as string })),
    meId: userId,
    lessons: (lessonRows ?? []).map((l) => {
      const s = student.get(l.student_id as string);
      return {
        teacherId: l.teacher_id as string,
        studentId: l.student_id as string,
        studentName: s?.name ?? "Unknown student",
        grade: s?.grade ?? 0,
        subject: subjectName.get(l.subject_id as string) ?? "Unknown subject",
        note: (l.note as string | null)?.trim() || null,
      };
    }),
    attendance: (attendanceRows ?? []).map((a) => ({
      studentName: student.get(a.student_id as string)?.name ?? "Unknown student",
      present: a.present as boolean,
    })),
  });

  const iAmQuiet = board.quiet.some((t) => t.isMe);
  const text = buildDayBoardText(board);
  const marked = board.presentCount + board.absent.length;
  const teacherCount = board.taught.length + board.quiet.length;

  return (
    <>
      <TopBar eyebrow="Everyone’s log" title="Day board" />
      <main className="wrap" style={{ paddingTop: 4 }}>
        <DayStrip on={on} basePath="/board" label="Board date" />

        <section className="card stack">
          <div className="between">
            <h2>{on === today ? "Today" : prettyDateLong(on)}</h2>
            <ShareTextButton
              text={text}
              title={`Day board ${prettyDateLong(on)}`}
              disabled={board.lessonCount === 0}
            />
          </div>
          <div className="gapbar">
            <span className="gap">
              {board.lessonCount} {board.lessonCount === 1 ? "lesson" : "lessons"}
            </span>
            <span className="gap" data-level={board.quiet.length === 0 ? "ok" : undefined}>
              {board.taught.length} of {teacherCount} teachers
            </span>
            {marked > 0 && (
              <span className="gap" data-level={board.absent.length === 0 ? "ok" : "warn"}>
                {board.presentCount} present
              </span>
            )}
          </div>
        </section>

        {board.lessonCount === 0 ? (
          <div className="empty" style={{ marginTop: 12 }}>
            Nothing logged for this day yet.
            {on === today && (
              <>
                {" "}
                <Link href="/" style={{ textDecoration: "underline" }}>
                  Start on Today &rarr;
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="register" style={{ marginTop: 12 }}>
            {board.taught.map((t) => (
              <article className="row" key={t.teacherId}>
                <header>
                  <span className="name">{t.name}</span>
                  {t.isMe && <span className="grade">you</span>}
                  <span className="meta">
                    {t.lessonCount} {t.lessonCount === 1 ? "lesson" : "lessons"}
                  </span>
                </header>

                <div className="chapters">
                  {t.students.map((s) => (
                    <div className="chapter" data-static="true" key={s.studentId}>
                      <span className="subj">{gradeShort(s.grade)}</span>
                      <span className="what">
                        <Link href={`/students/${s.studentId}`} style={{ fontWeight: 600 }}>
                          {s.studentName}
                        </Link>
                        {" — "}
                        {s.entries.map((e, i) => (
                          <span key={`${e.subject}-${i}`}>
                            {i > 0 && ", "}
                            {e.subject}
                            {e.note && (
                              <span style={{ color: "var(--ink-soft)" }}> ({e.note})</span>
                            )}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}

        {board.quiet.length > 0 && (
          <section className="card stack" style={{ marginTop: 12 }}>
            <div className="between">
              <h2>Not logged yet</h2>
              <span className="eyebrow">{board.quiet.length}</span>
            </div>
            <div className="gapbar">
              {board.quiet.map((t) => (
                <span className="gap" key={t.teacherId}>
                  {t.name}
                  {t.isMe && " (you)"}
                </span>
              ))}
            </div>
            {iAmQuiet && (
              <Link href="/" className="btn" style={{ textAlign: "center" }}>
                Log your lessons
              </Link>
            )}
            <p className="hint">
              A teacher who genuinely taught nothing on this day lands here too
              &mdash; the board cannot tell the two apart, so read it as a nudge,
              not an accusation.
            </p>
          </section>
        )}

        {board.absent.length > 0 && (
          <section className="card stack" style={{ marginTop: 12 }}>
            <h2>Absent</h2>
            <div className="gapbar">
              {board.absent.map((name) => (
                <span className="gap" data-level="bad" key={name}>
                  {name}
                </span>
              ))}
            </div>
          </section>
        )}

        <p className="hint" style={{ marginTop: 14 }}>
          This screen only reads. Log and correct your own lessons on Today
          &mdash; the board picks the change up straight away.
        </p>
      </main>
      <Nav />
    </>
  );
}
