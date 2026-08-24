import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildRoster, buildRosterText } from "../src/lib/roster.ts";
import { NURSERY } from "../src/lib/grades.ts";

/**
 * The arrangement is only useful if it is complete: a teacher with nobody must
 * still appear, and a child on nobody's list must be impossible to miss —
 * that child never shows up on anyone's Today.
 */

const TEACHERS = [
  { id: "t-meena", name: "Meena" },
  { id: "t-arjun", name: "Arjun" },
  { id: "t-zara", name: "Zara" },
];

const STUDENTS = [
  { id: "s1", name: "Aarav", grade: 5, active: true },
  { id: "s2", name: "Diya", grade: 3, active: true },
  { id: "s3", name: "Ishani", grade: NURSERY, active: true },
  { id: "s4", name: "Kabir", grade: 7, active: true },
  { id: "s5", name: "Old Boy", grade: 9, active: false },
];

function roster(links: [string, string][], meId = "t-meena") {
  return buildRoster({
    teachers: TEACHERS,
    students: STUDENTS,
    links: links.map(([teacherId, studentId]) => ({ teacherId, studentId })),
    meId,
  });
}

describe("grouping", () => {
  test("lists each teacher's students, youngest first", () => {
    const r = roster([
      ["t-meena", "s1"],
      ["t-meena", "s3"],
      ["t-arjun", "s2"],
    ]);

    const meena = r.teachers.find((t) => t.name === "Meena")!;
    assert.deepEqual(meena.students.map((s) => s.name), ["Ishani", "Aarav"]);
  });

  test("a teacher with nobody is still listed", () => {
    const r = roster([["t-meena", "s1"]]);

    assert.equal(r.teachers.length, 3);
    assert.deepEqual(r.teachers.find((t) => t.name === "Zara")!.students, []);
  });

  test("teachers read alphabetically, and the signed-in one is marked", () => {
    const r = roster([["t-meena", "s1"]], "t-zara");

    assert.deepEqual(r.teachers.map((t) => t.name), ["Arjun", "Meena", "Zara"]);
    assert.deepEqual(
      r.teachers.filter((t) => t.isMe).map((t) => t.name),
      ["Zara"]
    );
  });
});

describe("shared students", () => {
  test("a student on two lists is marked shared on both cards", () => {
    const r = roster([
      ["t-meena", "s1"],
      ["t-arjun", "s1"],
    ]);

    for (const name of ["Meena", "Arjun"]) {
      const card = r.teachers.find((t) => t.name === name)!;
      assert.equal(card.students[0].shared, true, `${name} should show Aarav as shared`);
    }
    assert.equal(r.sharedCount, 1);
  });

  test("a student on one list is not shared", () => {
    const r = roster([["t-meena", "s1"]]);

    assert.equal(r.teachers.find((t) => t.name === "Meena")!.students[0].shared, false);
    assert.equal(r.sharedCount, 0);
  });
});

describe("students on nobody's list", () => {
  test("names them, youngest first", () => {
    const r = roster([["t-meena", "s1"]]);

    assert.deepEqual(r.unassigned.map((s) => s.name), ["Ishani", "Diya", "Kabir"]);
  });

  test("is empty when everyone is claimed", () => {
    const r = roster([
      ["t-meena", "s1"],
      ["t-meena", "s2"],
      ["t-arjun", "s3"],
      ["t-zara", "s4"],
    ]);

    assert.deepEqual(r.unassigned, []);
  });

  test("never cries wolf over a retired student", () => {
    const r = roster([]);

    assert.equal(r.unassigned.some((s) => s.name === "Old Boy"), false);
    assert.equal(r.studentCount, 4);
  });
});

describe("retired students", () => {
  test("are left off a teacher's card even when the link survives", () => {
    const r = roster([["t-meena", "s5"]]);

    assert.deepEqual(r.teachers.find((t) => t.name === "Meena")!.students, []);
  });
});

describe("the message it produces", () => {
  const out = buildRosterText(
    roster([
      ["t-meena", "s1"],
      ["t-arjun", "s1"],
      ["t-arjun", "s3"],
    ])
  );

  test("names each teacher with a count", () => {
    assert.match(out, /ARJUN — 2/);
    assert.match(out, /MEENA — 1/);
  });

  test("says plainly when a teacher has nobody", () => {
    assert.match(out, /ZARA — no students yet/);
  });

  test("names the children nobody has claimed", () => {
    assert.match(out, /On nobody's list: Diya and Kabir\./);
  });

  test("never runs three blank lines together, and ends with one newline", () => {
    assert.doesNotMatch(out, /\n\n\n/);
    assert.ok(out.endsWith("\n"));
    assert.equal(out.endsWith("\n\n"), false);
  });
});
