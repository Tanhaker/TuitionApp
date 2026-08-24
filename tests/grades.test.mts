import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  GRADES,
  LKG,
  NURSERY,
  UKG,
  gradeLabel,
  gradeMatchesQuery,
  gradeShort,
  isValidGrade,
} from "../src/lib/grades.ts";

/**
 * Nursery and the two kindergarten years sit below Class 1 on the same integer
 * line, so the ordering and range checks the rest of the app relies on keep
 * working untouched.
 */

describe("ordering", () => {
  test("Nursery comes before LKG, before UKG, before Class 1", () => {
    assert.ok(NURSERY < LKG);
    assert.ok(LKG < UKG);
    assert.ok(UKG < 1);
  });

  test("GRADES is sorted low to high and complete", () => {
    assert.deepEqual(GRADES, [...GRADES].sort((a, b) => a - b));
    assert.equal(GRADES.length, 15); // Nursery, LKG, UKG, and Classes 1-12
    assert.equal(GRADES[0], NURSERY);
    assert.equal(GRADES.at(-1), 12);
  });

  test("sorting students by grade puts the little ones first", () => {
    const mixed = [5, LKG, 12, NURSERY, UKG, 1];
    assert.deepEqual([...mixed].sort((a, b) => a - b), [NURSERY, LKG, UKG, 1, 5, 12]);
  });
});

describe("subject ranges still work by plain comparison", () => {
  const covers = (min: number, max: number, grade: number) => grade >= min && grade <= max;

  test("a nursery-only subject reaches nobody else", () => {
    assert.ok(covers(NURSERY, NURSERY, NURSERY));
    assert.equal(covers(NURSERY, NURSERY, LKG), false);
  });

  test("a pre-primary subject spans Nursery to UKG", () => {
    assert.ok(covers(NURSERY, UKG, NURSERY));
    assert.ok(covers(NURSERY, UKG, UKG));
    assert.equal(covers(NURSERY, UKG, 1), false);
  });

  test("an LKG-UKG subject does not reach down into Nursery", () => {
    assert.equal(covers(LKG, UKG, NURSERY), false);
  });

  test("a kindergarten subject reaches both KG years and stops at Class 1", () => {
    assert.ok(covers(LKG, UKG, LKG));
    assert.ok(covers(LKG, UKG, UKG));
    assert.equal(covers(LKG, UKG, 1), false);
  });

  test("a primary subject spanning LKG to Class 5", () => {
    assert.ok(covers(LKG, 5, LKG));
    assert.ok(covers(LKG, 5, 3));
    assert.equal(covers(LKG, 5, 6), false);
  });

  test("an existing Class 6-12 subject never reaches kindergarten", () => {
    assert.equal(covers(6, 12, NURSERY), false);
    assert.equal(covers(6, 12, LKG), false);
    assert.equal(covers(6, 12, UKG), false);
    assert.ok(covers(6, 12, 7));
  });
});

describe("labels", () => {
  test("the pre-primary years read as themselves, not as class numbers", () => {
    assert.equal(gradeLabel(NURSERY), "Nursery");
    assert.equal(gradeLabel(LKG), "LKG");
    assert.equal(gradeLabel(UKG), "UKG");
    assert.doesNotMatch(gradeLabel(NURSERY), /Class/);
    assert.doesNotMatch(gradeLabel(LKG), /Class/);
    assert.doesNotMatch(gradeLabel(UKG), /-1|0/);
    assert.doesNotMatch(gradeLabel(NURSERY), /-2/);
  });

  test("ordinary classes keep the Class prefix", () => {
    assert.equal(gradeLabel(1), "Class 1");
    assert.equal(gradeLabel(12), "Class 12");
  });

  test("short form drops the prefix but keeps the pre-primary names", () => {
    assert.equal(gradeShort(NURSERY), "Nur");
    assert.equal(gradeShort(LKG), "LKG");
    assert.equal(gradeShort(UKG), "UKG");
    assert.equal(gradeShort(7), "7");
  });

  test("every level has a usable label", () => {
    for (const g of GRADES) {
      assert.ok(gradeLabel(g).length > 0);
      assert.doesNotMatch(gradeShort(g), /^-/, `${g} rendered a raw negative`);
    }
  });
});

describe("isValidGrade", () => {
  test("accepts every level in GRADES", () => {
    for (const g of GRADES) assert.ok(isValidGrade(g), `${g} should be valid`);
  });

  test("rejects out of range and non-integers", () => {
    for (const bad of [-3, 13, 1.5, NaN]) {
      assert.equal(isValidGrade(bad), false, `${bad} should be rejected`);
    }
  });
});

describe("roster search", () => {
  test("finds nursery by its full name and its short form", () => {
    assert.ok(gradeMatchesQuery(NURSERY, "nursery"));
    assert.ok(gradeMatchesQuery(NURSERY, "Nur"));
    assert.equal(gradeMatchesQuery(LKG, "nursery"), false);
  });

  test("finds kindergarten by name, in any case", () => {
    assert.ok(gradeMatchesQuery(LKG, "lkg"));
    assert.ok(gradeMatchesQuery(LKG, "LKG"));
    assert.ok(gradeMatchesQuery(UKG, "ukg"));
  });

  test("'kg' finds both kindergarten years and nothing else", () => {
    assert.ok(gradeMatchesQuery(LKG, "kg"));
    assert.ok(gradeMatchesQuery(UKG, "kg"));
    assert.equal(gradeMatchesQuery(1, "kg"), false);
    assert.equal(gradeMatchesQuery(NURSERY, "kg"), false);
  });

  test("still finds ordinary classes by number", () => {
    assert.ok(gradeMatchesQuery(5, "5"));
    assert.ok(gradeMatchesQuery(5, "class 5"));
    assert.equal(gradeMatchesQuery(5, "6"), false);
  });

  test("does not match kindergarten against a bare number", () => {
    assert.equal(gradeMatchesQuery(UKG, "0"), false);
    assert.equal(gradeMatchesQuery(LKG, "-1"), false);
    assert.equal(gradeMatchesQuery(NURSERY, "-2"), false);
  });
});
