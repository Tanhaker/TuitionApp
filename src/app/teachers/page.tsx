import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireUserId } from "@/lib/auth";
import TopBar from "@/components/TopBar";
import Nav from "@/components/Nav";
import ShareTextButton from "@/components/ShareTextButton";
import { buildRoster, buildRosterText } from "@/lib/roster";
import { gradeShort } from "@/lib/grades";

export const dynamic = "force-dynamic";

/**
 * Who teaches whom, for everyone to see.
 *
 * Read-only. Your own list is edited on Students, where the roster and the
 * "add to my list" control already are; a second place to change it would only
 * split the one action across two screens.
 *
 * teacher_students is readable by every signed-in teacher (ts_read is
 * `using (true)`) while writes stay pinned to `teacher_id = auth.uid()`. So
 * this screen can show the whole arrangement without anyone being able to
 * change somebody else's list from it.
 */
export default async function TeachersPage() {
  const supabase = await createClient();
  const userId = await requireUserId();

  const [{ data: teacherRows }, { data: studentRows }, { data: linkRows }] = await Promise.all([
    supabase.from("teachers").select("id, name").order("name"),
    // Retired students come back too, so buildRoster can drop them itself
    // rather than the unassigned list quietly counting people who have left.
    supabase.from("students").select("id, name, grade, active"),
    supabase.from("teacher_students").select("teacher_id, student_id"),
  ]);

  const roster = buildRoster({
    teachers: (teacherRows ?? []).map((t) => ({ id: t.id as string, name: t.name as string })),
    students: (studentRows ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      grade: s.grade as number,
      active: s.active as boolean,
    })),
    links: (linkRows ?? []).map((l) => ({
      teacherId: l.teacher_id as string,
      studentId: l.student_id as string,
    })),
    meId: userId,
  });

  const text = buildRosterText(roster);

  return (
    <>
      <TopBar eyebrow="Who teaches whom" title="Teachers" />
      <main className="wrap stack" style={{ paddingTop: 12 }}>
        <div className="between">
          <span className="eyebrow">Everyone can see this list</span>
          <Link href="/students" className="eyebrow" style={{ textDecoration: "underline" }}>
            Students &rarr;
          </Link>
        </div>

        <section className="card stack">
          <div className="between">
            <h2>The arrangement</h2>
            <ShareTextButton text={text} title="Who teaches whom" />
          </div>
          <div className="gapbar">
            <span className="gap">{roster.teachers.length} teachers</span>
            <span className="gap">
              {roster.studentCount} {roster.studentCount === 1 ? "student" : "students"}
            </span>
            {roster.sharedCount > 0 && (
              <span className="gap" data-level="warn">
                {roster.sharedCount} shared
              </span>
            )}
            <span className="gap" data-level={roster.unassigned.length === 0 ? "ok" : "bad"}>
              {roster.unassigned.length} unclaimed
            </span>
          </div>
        </section>

        {roster.unassigned.length > 0 && (
          <section className="card stack">
            <div className="between">
              <h2>On nobody&rsquo;s list</h2>
              <span className="eyebrow">{roster.unassigned.length}</span>
            </div>
            <p className="hint">
              These children are on the tuition roster but not on any
              teacher&rsquo;s list, so they appear on nobody&rsquo;s Today and
              nothing gets logged for them. Open Students and tap &ldquo;Add to
              my list&rdquo; on whoever is yours.
            </p>
            <div className="chips">
              {roster.unassigned.map((s) => (
                <Link className="chip" key={s.id} href={`/students/${s.id}`}>
                  {s.name}
                  <span className="days">{gradeShort(s.grade)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="register">
          {roster.teachers.map((t) => (
            <article className="row" key={t.id}>
              <header>
                <span className="name">{t.name}</span>
                {t.isMe && <span className="grade">you</span>}
                <span className="meta">
                  {t.students.length} {t.students.length === 1 ? "student" : "students"}
                </span>
              </header>

              {t.students.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  Nobody on this list yet.
                </p>
              ) : (
                <div className="chips">
                  {t.students.map((s) => (
                    <Link
                      className="chip"
                      key={s.id}
                      href={`/students/${s.id}`}
                      data-due={s.shared ? "soon" : undefined}
                      title={s.shared ? `${s.name} is on more than one list` : undefined}
                    >
                      {s.name}
                      <span className="days">{gradeShort(s.grade)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>

        <p className="hint">
          A student in the warm colour is on more than one teacher&rsquo;s list
          &mdash; that is the tuition swapping children about, not a mistake.
          You can only change your own list, and you do that on Students.
        </p>
      </main>
      <Nav />
    </>
  );
}
