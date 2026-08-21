/**
 * Class levels, including the two kindergarten years.
 *
 * `grade` stays an integer because everything depends on it being ordered and
 * comparable: students are sorted by it, and every subject carries a
 * min_grade/max_grade range that decides which chips appear on a row. Storing
 * "LKG" as text would break both.
 *
 * So kindergarten sits below Class 1 on the same number line:
 *
 *   -1  LKG   (Lower Kindergarten)
 *    0  UKG   (Upper Kindergarten)
 *    1  Class 1
 *   ... through Class 12
 *
 * A subject covering LKG through Class 5 is min_grade -1, max_grade 5, and the
 * existing `grade >= min_grade && grade <= max_grade` check needs no change.
 *
 * If a nursery or playgroup year is ever added it goes at -2, keeping the order
 * intact.
 */

export const LKG = -1;
export const UKG = 0;

export const MIN_GRADE = LKG;
export const MAX_GRADE = 12;

/** Every level, lowest first — the order they should appear in any picker. */
export const GRADES: number[] = [
  LKG,
  UKG,
  ...Array.from({ length: 12 }, (_, i) => i + 1),
];

/** "LKG" · "UKG" · "Class 5" — for headings and anywhere a level stands alone. */
export function gradeLabel(grade: number): string {
  if (grade === LKG) return "LKG";
  if (grade === UKG) return "UKG";
  return `Class ${grade}`;
}

/** "LKG" · "UKG" · "5" — for tight spaces like the range badge and the CSV. */
export function gradeShort(grade: number): string {
  if (grade === LKG) return "LKG";
  if (grade === UKG) return "UKG";
  return String(grade);
}

export function isValidGrade(grade: number): boolean {
  return Number.isInteger(grade) && grade >= MIN_GRADE && grade <= MAX_GRADE;
}

/**
 * Does this student's level match what was typed into the roster search?
 *
 * Matches "5", "class 5", "lkg", "ukg" and "kg" (which finds both years),
 * because a teacher searching for the little ones will type whichever comes to
 * mind first.
 */
export function gradeMatchesQuery(grade: number, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (q === "kg") return grade === LKG || grade === UKG;
  const label = gradeLabel(grade).toLowerCase();
  return label === q || gradeShort(grade).toLowerCase() === q || label === `class ${q}`;
}
