/**
 * Class levels, including the pre-primary years and the Hobby Centre.
 *
 * `grade` stays an integer because everything depends on it being ordered and
 * comparable: students are sorted by it, and every subject carries a
 * min_grade/max_grade range that decides which chips appear on a row. Storing
 * "LKG" as text would break both.
 *
 * So the little ones sit below Class 1 on the same number line:
 *
 *   -3  Hobby Centre
 *   -2  Nursery
 *   -1  LKG   (Lower Kindergarten)
 *    0  UKG   (Upper Kindergarten)
 *    1  Class 1
 *   ... through Class 12
 *
 * A subject covering Nursery through Class 5 is min_grade -2, max_grade 5, and
 * the existing `grade >= min_grade && grade <= max_grade` check needs no change.
 *
 * Hobby Centre is not an age year — it is a separate programme that happens to
 * need its own row on the register. -3 only decides where it sits in a picker
 * and which subjects reach it; nothing reads it as "younger than Nursery".
 * A child in the Hobby Centre and in a class is two records, not one.
 *
 * If a playgroup year is ever added it goes at -4, keeping the order intact.
 * Note that MIN_GRADE moving down means supabase/schema.sql has to be re-run:
 * the students_grade_check constraint carries the same bound.
 */

export const HOBBY_CENTRE = -3;
export const NURSERY = -2;
export const LKG = -1;
export const UKG = 0;

export const MIN_GRADE = HOBBY_CENTRE;
export const MAX_GRADE = 12;

/** Every level, lowest first — the order they should appear in any picker. */
export const GRADES: number[] = [
  HOBBY_CENTRE,
  NURSERY,
  LKG,
  UKG,
  ...Array.from({ length: 12 }, (_, i) => i + 1),
];

/** "Hobby Centre" · "Nursery" · "Class 5" — for headings and anywhere a level stands alone. */
export function gradeLabel(grade: number): string {
  if (grade === HOBBY_CENTRE) return "Hobby Centre";
  if (grade === NURSERY) return "Nursery";
  if (grade === LKG) return "LKG";
  if (grade === UKG) return "UKG";
  return `Class ${grade}`;
}

/** "Hobby" · "Nur" · "5" — for tight spaces like the range badge and the CSV. */
export function gradeShort(grade: number): string {
  if (grade === HOBBY_CENTRE) return "Hobby";
  if (grade === NURSERY) return "Nur";
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
 * Matches "5", "class 5", "hobby", "hobby centre", "nursery", "nur", "lkg",
 * "ukg" and "kg" (which finds both kindergarten years), because a teacher
 * searching for the little ones will type whichever comes to mind first.
 *
 * "hobby", "hobby centre", "nursery" and "nur" all fall out of the label and
 * short-form checks below without needing a case of their own.
 * "kg" deliberately does NOT reach Nursery — a nursery child is not in either
 * kindergarten year, and a search that quietly widened would put the wrong
 * children in front of whoever is looking for their LKG group.
 */
export function gradeMatchesQuery(grade: number, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (q === "kg") return grade === LKG || grade === UKG;
  const label = gradeLabel(grade).toLowerCase();
  return label === q || gradeShort(grade).toLowerCase() === q || label === `class ${q}`;
}
