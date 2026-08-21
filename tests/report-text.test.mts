import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildTextReport, type ReportMeta, type ReportStudent } from "../src/lib/report-text.ts";

/**
 * The written export is sent to parents, so the wording is the product. These
 * pin the grammar cases that read as broken English when they regress.
 */

const range: ReportMeta = {
  teacherName: "Bhakti",
  from: "2026-07-20",
  to: "2026-08-20",
  mine: true,
  notTaught: [],
};

const aarav: ReportStudent = {
  name: "Aarav Patel",
  grade: 5,
  school: "Sunrise School",
  total: 9,
  subjects: [
    { name: "Maths", count: 6, chapters: ["Ch 4 Fractions", "Ch 5 Decimals"], last: "2026-08-20" },
    { name: "English", count: 3, chapters: ['Poem "The Road"'], last: "2026-08-18" },
  ],
};

describe("range report", () => {
  test("names the teacher and the period", () => {
    const out = buildTextReport(range, [aarav]);
    assert.match(out, /TUITION REGISTER/);
    assert.match(out, /Bhakti/);
    assert.match(out, /20 July 2026 to 20 August 2026/);
  });

  test("joins chapters with a comma and an 'and'", () => {
    const out = buildTextReport(range, [aarav]);
    assert.match(out, /Ch 4 Fractions and Ch 5 Decimals/);
  });

  test("uses 'once' rather than '1 times'", () => {
    const out = buildTextReport(range, [{ ...aarav, total: 1 }]);
    assert.match(out, /you taught Aarav once\./);
    assert.doesNotMatch(out, /1 times/);
  });

  test("uses '1 session' rather than '1 sessions'", () => {
    const out = buildTextReport(range, [
      { ...aarav, subjects: [{ name: "Maths", count: 1, chapters: [], last: "2026-08-20" }] },
    ]);
    assert.match(out, /\(1 session\)/);
    assert.doesNotMatch(out, /1 sessions/);
  });

  test("says so plainly when no chapter was recorded", () => {
    const out = buildTextReport(range, [
      { ...aarav, subjects: [{ name: "Science", count: 2, chapters: [], last: "2026-08-19" }] },
    ]);
    assert.match(out, /no chapters were recorded/);
  });

  test("names kindergarten properly instead of 'Class -1'", () => {
    const out = buildTextReport(range, [
      { ...aarav, name: "Meera Shah", grade: -1, school: "Little Star" },
    ]);
    assert.match(out, /MEERA SHAH - LKG, Little Star/);
    assert.doesNotMatch(out, /Class -1|Class 0/);
  });

  test("omits the school when there is none", () => {
    const out = buildTextReport(range, [{ ...aarav, school: null }]);
    assert.match(out, /AARAV PATEL - Class 5\n/);
  });

  test("reads in the third person when not scoped to one teacher", () => {
    const out = buildTextReport({ ...range, mine: false }, [aarav]);
    assert.match(out, /Aarav was taught 9 times/);
    assert.match(out, /every teacher/);
    assert.doesNotMatch(out, /you taught/);
  });

  test("handles an empty report", () => {
    const out = buildTextReport(range, []);
    assert.match(out, /You have not logged any lessons in this period/);
  });
});

describe("single-day report", () => {
  const day: ReportMeta = { ...range, from: "2026-08-20", singleDay: true };

  test("leads with the weekday and drops the range framing", () => {
    const out = buildTextReport(day, [aarav]);
    assert.match(out, /DAILY REGISTER/);
    assert.match(out, /Thursday/);
    assert.doesNotMatch(out, /Between/);
    assert.doesNotMatch(out, /The last lesson was on/);
  });

  test("lists the subjects taught and the chapter under each", () => {
    const out = buildTextReport(day, [aarav]);
    assert.match(out, /You taught Aarav Maths and English\./);
    assert.match(out, / {2}Maths - Ch 4 Fractions/);
  });

  test("marks a subject with no chapter", () => {
    const out = buildTextReport(day, [
      { ...aarav, subjects: [{ name: "Science", count: 1, chapters: [], last: "2026-08-20" }] },
    ]);
    assert.match(out, /Science - no chapter recorded/);
  });

  test("handles a day with nothing logged", () => {
    const out = buildTextReport(day, []);
    assert.match(out, /You logged no lessons on this day/);
  });
});

describe("students not taught", () => {
  test("uses singular agreement for one name", () => {
    const out = buildTextReport({ ...range, notTaught: ["Ravi Mehta"] }, [aarav]);
    assert.match(out, /Ravi Mehta is on your list/);
  });

  test("uses plural agreement and an 'and' for several", () => {
    const out = buildTextReport(
      { ...range, notTaught: ["Ravi Mehta", "Sana Khan", "Dev Joshi"] },
      [aarav]
    );
    assert.match(out, /Ravi Mehta, Sana Khan and Dev Joshi are on your list/);
  });

  test("is omitted entirely when everyone was taught", () => {
    const out = buildTextReport(range, [aarav]);
    assert.doesNotMatch(out, /NOT TAUGHT/);
  });
});

describe("formatting", () => {
  test("wraps long lines so they survive being pasted into a message", () => {
    const out = buildTextReport(range, [
      {
        ...aarav,
        subjects: [
          {
            name: "Social Science",
            count: 4,
            chapters: ["Ch 1 The French Revolution", "Ch 2 Socialism in Europe", "Ch 3 Nazism"],
            last: "2026-08-20",
          },
        ],
      },
    ]);
    for (const line of out.split("\n")) {
      assert.ok(line.length <= 72, `line too long (${line.length}): ${line}`);
    }
  });

  test("never runs three blank lines together", () => {
    const out = buildTextReport({ ...range, notTaught: ["Ravi"] }, [aarav]);
    assert.doesNotMatch(out, /\n{3}/);
  });

  test("ends with exactly one newline", () => {
    const out = buildTextReport(range, [aarav]);
    assert.ok(out.endsWith("\n"));
    assert.ok(!out.endsWith("\n\n"));
  });
});
