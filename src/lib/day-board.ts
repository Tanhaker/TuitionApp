// Relative with an explicit extension so Node's test runner can resolve this
// module directly, without the bundler's "@/" alias.
import { fromISO } from "./dates.ts";
import { gradeLabel } from "./grades.ts";
import { list, wrap } from "./text.ts";

/**
 * One day, every teacher — the thing that used to be six WhatsApp messages.
 *
 * The board answers three questions and deliberately nothing else: who taught
 * what today, who has not filed anything yet, and who was absent. Anything
 * broader belongs on Reports, which already covers a range and exports it.
 *
 * The text form exists so a day can still leave the app — for the parents'
 * group, or for whoever is not on the app yet — without anyone retyping it.
 */

export type BoardLesson = {
  studentName: string;
  grade: number;
  subject: string;
  /** The chapter or topic, when one was written. */
  note: string | null;
};

export type BoardStudent = {
  studentId: string;
  studentName: string;
  grade: number;
  /** Subjects that teacher covered with this child today, in teaching order. */
  entries: { subject: string; note: string | null }[];
};

export type BoardTeacher = {
  teacherId: string;
  name: string;
  /** The signed-in teacher, so the screen can say "you". */
  isMe: boolean;
  students: BoardStudent[];
  lessonCount: number;
};

export type BoardDay = {
  date: string;
  /** Teachers who logged something, then teachers who have not, both by name. */
  taught: BoardTeacher[];
  quiet: { teacherId: string; name: string; isMe: boolean }[];
  absent: string[];
  presentCount: number;
  lessonCount: number;
};

/**
 * Folds raw lesson rows into the board.
 *
 * Pure, and separate from the page, because the grouping is the part worth
 * testing: a teacher must appear once whatever order their rows arrive in, and
 * a teacher with nothing logged must still be listed rather than vanish.
 */
export function buildDayBoard(input: {
  date: string;
  teachers: { id: string; name: string }[];
  meId: string;
  lessons: (BoardLesson & { teacherId: string; studentId: string })[];
  attendance: { studentName: string; present: boolean }[];
}): BoardDay {
  const byTeacher = new Map<string, Map<string, BoardStudent>>();

  for (const l of input.lessons) {
    const students = byTeacher.get(l.teacherId) ?? new Map<string, BoardStudent>();
    const student = students.get(l.studentId) ?? {
      studentId: l.studentId,
      studentName: l.studentName,
      grade: l.grade,
      entries: [],
    };
    student.entries.push({ subject: l.subject, note: l.note });
    students.set(l.studentId, student);
    byTeacher.set(l.teacherId, students);
  }

  const named = [...input.teachers].sort((a, b) => a.name.localeCompare(b.name));

  const taught: BoardTeacher[] = [];
  const quiet: BoardDay["quiet"] = [];

  for (const t of named) {
    const students = byTeacher.get(t.id);
    if (!students || students.size === 0) {
      quiet.push({ teacherId: t.id, name: t.name, isMe: t.id === input.meId });
      continue;
    }
    const rows = [...students.values()].sort(
      (a, b) => a.grade - b.grade || a.studentName.localeCompare(b.studentName)
    );
    taught.push({
      teacherId: t.id,
      name: t.name,
      isMe: t.id === input.meId,
      students: rows,
      lessonCount: rows.reduce((n, r) => n + r.entries.length, 0),
    });
  }

  return {
    date: input.date,
    taught,
    quiet,
    absent: input.attendance
      .filter((a) => !a.present)
      .map((a) => a.studentName)
      .sort((a, b) => a.localeCompare(b)),
    presentCount: input.attendance.filter((a) => a.present).length,
    lessonCount: input.lessons.length,
  };
}

/** "Thursday 20 August 2026" */
function weekdayFull(iso: string): string {
  return fromISO(iso).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function sessions(n: number): string {
  return n === 1 ? "1 lesson" : `${n} lessons`;
}

/** The board as a message: what a teacher would otherwise have typed by hand. */
export function buildDayBoardText(board: BoardDay): string {
  const lines: string[] = [];

  lines.push("TUITION — DAY BOARD");
  lines.push(weekdayFull(board.date));
  lines.push("");

  if (board.taught.length === 0) {
    lines.push(wrap("Nothing has been logged for this day yet."));
  }

  for (const t of board.taught) {
    lines.push(`${t.name.toUpperCase()} — ${sessions(t.lessonCount)}`);
    for (const s of t.students) {
      const covered = s.entries
        .map((e) => (e.note ? `${e.subject} (${e.note})` : e.subject))
        .join(", ");
      lines.push(wrap(`  ${s.studentName}, ${gradeLabel(s.grade)}: ${covered}`, 66));
    }
    lines.push("");
  }

  if (board.quiet.length > 0) {
    lines.push(wrap(`Not logged yet: ${list(board.quiet.map((t) => t.name))}.`));
    lines.push("");
  }

  if (board.absent.length > 0) {
    lines.push(
      wrap(
        board.absent.length === 1
          ? `Absent: ${board.absent[0]}.`
          : `Absent: ${list(board.absent)}.`
      )
    );
  } else if (board.presentCount > 0) {
    lines.push(`Attendance marked for ${board.presentCount}, nobody absent.`);
  }

  // Collapse any run of blank lines the sections left behind, then end on
  // exactly one newline — the same shape the coverage report ends on.
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
