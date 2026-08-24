import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildDayBoard, buildDayBoardText } from "../src/lib/day-board.ts";
import { LKG, NURSERY } from "../src/lib/grades.ts";

/**
 * The day board replaces six WhatsApp messages, so the two things that must
 * hold are: every teacher is accounted for, including the ones who logged
 * nothing, and one teacher's rows fold into one entry however they arrive.
 */

const TEACHERS = [
  { id: "t-meena", name: "Meena" },
  { id: "t-arjun", name: "Arjun" },
  { id: "t-zara", name: "Zara" },
];

function lesson(
  teacherId: string,
  studentId: string,
  studentName: string,
  grade: number,
  subject: string,
  note: string | null = null
) {
  return { teacherId, studentId, studentName, grade, subject, note };
}

describe("grouping", () => {
  test("folds a teacher's scattered rows into one entry per student", () => {
    const board = buildDayBoard({
      date: "2026-08-24",
      teachers: TEACHERS,
      meId: "t-meena",
      lessons: [
        lesson("t-meena", "s1", "Aarav", 5, "Maths", "Ch 4"),
        lesson("t-arjun", "s2", "Diya", 3, "English"),
        lesson("t-meena", "s1", "Aarav", 5, "English", "Poem 2"),
      ],
      attendance: [],
    });

    assert.equal(board.taught.length, 2);
    const meena = board.taught.find((t) => t.name === "Meena")!;
    assert.equal(meena.students.length, 1);
    assert.deepEqual(
      meena.students[0].entries.map((e) => e.subject),
      ["Maths", "English"]
    );
    assert.equal(meena.lessonCount, 2);
  });

  test("a teacher who logged nothing is listed as quiet, not dropped", () => {
    const board = buildDayBoard({
      date: "2026-08-24",
      teachers: TEACHERS,
      meId: "t-meena",
      lessons: [lesson("t-meena", "s1", "Aarav", 5, "Maths")],
      attendance: [],
    });

    assert.deepEqual(board.quiet.map((t) => t.name), ["Arjun", "Zara"]);
    assert.equal(board.taught.length + board.quiet.length, TEACHERS.length);
  });

  test("marks which teacher is the signed-in one on both lists", () => {
    const board = buildDayBoard({
      date: "2026-08-24",
      teachers: TEACHERS,
      meId: "t-zara",
      lessons: [lesson("t-meena", "s1", "Aarav", 5, "Maths")],
      attendance: [],
    });

    assert.equal(board.taught.every((t) => !t.isMe), true);
    assert.equal(board.quiet.find((t) => t.name === "Zara")!.isMe, true);
  });

  test("teachers read alphabetically and students youngest first", () => {
    const board = buildDayBoard({
      date: "2026-08-24",
      teachers: TEACHERS,
      meId: "t-meena",
      lessons: [
        lesson("t-zara", "s3", "Kabir", 7, "Science"),
        lesson("t-zara", "s4", "Ishani", NURSERY, "Rhymes"),
        lesson("t-arjun", "s2", "Diya", LKG, "Maths"),
      ],
      attendance: [],
    });

    assert.deepEqual(board.taught.map((t) => t.name), ["Arjun", "Zara"]);
    const zara = board.taught[1];
    assert.deepEqual(zara.students.map((s) => s.studentName), ["Ishani", "Kabir"]);
  });
});

describe("attendance", () => {
  test("counts the present and names the absent, alphabetically", () => {
    const board = buildDayBoard({
      date: "2026-08-24",
      teachers: TEACHERS,
      meId: "t-meena",
      lessons: [],
      attendance: [
        { studentName: "Kabir", present: true },
        { studentName: "Ishani", present: false },
        { studentName: "Aarav", present: false },
      ],
    });

    assert.equal(board.presentCount, 1);
    assert.deepEqual(board.absent, ["Aarav", "Ishani"]);
  });

  test("an unmarked day counts nobody either way", () => {
    const board = buildDayBoard({
      date: "2026-08-24",
      teachers: TEACHERS,
      meId: "t-meena",
      lessons: [],
      attendance: [],
    });

    assert.equal(board.presentCount, 0);
    assert.deepEqual(board.absent, []);
  });
});

describe("the message it produces", () => {
  const board = buildDayBoard({
    date: "2026-08-24",
    teachers: TEACHERS,
    meId: "t-meena",
    lessons: [
      lesson("t-meena", "s1", "Aarav", 5, "Maths", "Ch 4 Fractions"),
      lesson("t-meena", "s1", "Aarav", 5, "English"),
      lesson("t-arjun", "s4", "Ishani", NURSERY, "Rhymes", "Twinkle"),
    ],
    attendance: [
      { studentName: "Kabir", present: true },
      { studentName: "Diya", present: false },
    ],
  });
  const out = buildDayBoardText(board);

  test("leads with the weekday so a forwarded message dates itself", () => {
    assert.match(out, /Monday,? 24 August 2026/);
  });

  test("names each teacher with a lesson count", () => {
    assert.match(out, /MEENA — 2 lessons/);
    assert.match(out, /ARJUN — 1 lesson\b/);
  });

  test("puts the chapter beside its subject and leaves blanks bare", () => {
    assert.match(out, /Maths \(Ch 4 Fractions\)/);
    assert.match(out, /English(?!\s*\()/);
  });

  test("names the pre-primary class properly, not as a number", () => {
    assert.match(out, /Ishani, Nursery:/);
    assert.doesNotMatch(out, /Class -2/);
  });

  test("says who has not filed yet", () => {
    assert.match(out, /Not logged yet: Zara\./);
  });

  test("reports absences by name", () => {
    assert.match(out, /Absent: Diya\./);
  });

  test("says so plainly when the day is empty", () => {
    const empty = buildDayBoardText(
      buildDayBoard({
        date: "2026-08-24",
        teachers: TEACHERS,
        meId: "t-meena",
        lessons: [],
        attendance: [],
      })
    );
    assert.match(empty, /Nothing has been logged for this day yet\./);
  });

  test("never runs three blank lines together, and ends with one newline", () => {
    assert.doesNotMatch(out, /\n\n\n/);
    assert.ok(out.endsWith("\n"));
    assert.equal(out.endsWith("\n\n"), false);
  });
});
