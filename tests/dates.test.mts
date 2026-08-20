import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  daysBetween,
  fromISO,
  isISO,
  prettyDate,
  shiftDate,
  toISO,
  todayISO,
} from "../src/lib/dates.ts";

/**
 * These exist because every value in this app is a calendar day, and calendar
 * bugs are silent: a lesson filed one day off still looks like a lesson.
 */

describe("toISO / todayISO", () => {
  test("reads the LOCAL date, not the UTC one", () => {
    // 11:30pm local. A UTC round trip can push this to tomorrow depending on
    // the offset, which is the entire reason this module exists.
    assert.equal(toISO(new Date(2026, 7, 20, 23, 30)), "2026-08-20");
    // 00:30am local — the same hazard in the other direction.
    assert.equal(toISO(new Date(2026, 7, 20, 0, 30)), "2026-08-20");
  });

  test("pads single-digit months and days", () => {
    assert.equal(toISO(new Date(2026, 0, 5)), "2026-01-05");
  });

  test("todayISO is a well-formed date", () => {
    assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(isISO(todayISO()));
  });
});

describe("shiftDate", () => {
  test("crosses month boundaries", () => {
    assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
    assert.equal(shiftDate("2026-08-31", 1), "2026-09-01");
  });

  test("handles leap years", () => {
    assert.equal(shiftDate("2024-03-01", -1), "2024-02-29");
    assert.equal(shiftDate("2024-02-29", 1), "2024-03-01");
  });

  test("crosses year boundaries", () => {
    assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
    assert.equal(shiftDate("2027-01-01", -1), "2026-12-31");
  });

  test("matches the windows the app actually uses", () => {
    assert.equal(shiftDate("2026-08-20", -75), "2026-06-06"); // Today history
    assert.equal(shiftDate("2026-08-20", -365), "2025-08-20"); // Reports lookback
  });

  test("zero is identity", () => {
    assert.equal(shiftDate("2026-08-20", 0), "2026-08-20");
  });
});

describe("daysBetween", () => {
  test("is positive when the second date is later", () => {
    assert.equal(daysBetween("2026-08-13", "2026-08-20"), 7);
  });

  test("is zero for the same day and negative going backwards", () => {
    assert.equal(daysBetween("2026-08-20", "2026-08-20"), 0);
    assert.equal(daysBetween("2026-08-20", "2026-08-13"), -7);
  });

  test("stays a whole number across daylight-saving changes", () => {
    // A naive millisecond division gives 6.958… here and rounds wrong.
    assert.equal(daysBetween("2026-03-28", "2026-04-04"), 7); // EU spring
    assert.equal(daysBetween("2025-11-01", "2025-11-08"), 7); // US autumn
  });

  test("counts a full year", () => {
    assert.equal(daysBetween("2026-01-01", "2027-01-01"), 365);
    assert.equal(daysBetween("2024-01-01", "2025-01-01"), 366);
  });

  test("round-trips against shiftDate", () => {
    for (const n of [1, 5, 30, 75, 200, 365]) {
      assert.equal(daysBetween("2026-08-20", shiftDate("2026-08-20", n)), n);
    }
  });
});

describe("isISO", () => {
  test("accepts real dates", () => {
    assert.ok(isISO("2026-08-20"));
    assert.ok(isISO("2024-02-29"));
  });

  test("rejects malformed input", () => {
    for (const bad of ["", "2026-8-20", "20-08-2026", "not a date", "2026/08/20", null, 42]) {
      assert.equal(isISO(bad), false, `should reject ${JSON.stringify(bad)}`);
    }
  });
});

describe("ordering", () => {
  test("string comparison matches date order", () => {
    // The app compares these with < and > instead of parsing, so this has to hold.
    const days = ["2026-01-05", "2026-01-20", "2026-02-01", "2026-11-30", "2027-01-01"];
    const shuffled = [...days].reverse().sort();
    assert.deepEqual(shuffled, days);
  });
});

describe("prettyDate", () => {
  test("renders the correct weekday", () => {
    // 20 August 2026 is a Thursday.
    assert.match(prettyDate("2026-08-20"), /Thu/);
  });

  test("does not drift from the ISO value it was given", () => {
    assert.equal(toISO(fromISO("2026-08-20")), "2026-08-20");
  });
});
