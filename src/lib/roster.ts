// Relative with an explicit extension so Node's test runner can resolve this
// module directly, without the bundler's "@/" alias.
import { list } from "./text.ts";

/**
 * Who teaches whom, for the whole tuition at once.
 *
 * teacher_students is the only record of this, and until now it was only ever
 * read one teacher at a time — your own list, on your own screen. Six people
 * swapping students between them had no way to see the whole arrangement, so
 * a child could sit on nobody's list and simply never appear on anyone's Today.
 *
 * Turning that around is most of the value here: the unassigned list is the
 * part worth looking at, not the counts.
 */

export type RosterStudent = {
  id: string;
  name: string;
  grade: number;
  /** On more than one teacher's list — the tuition swaps students about. */
  shared: boolean;
};

export type RosterTeacher = {
  id: string;
  name: string;
  /** The signed-in teacher, so the screen can say "you". */
  isMe: boolean;
  students: RosterStudent[];
};

export type Roster = {
  teachers: RosterTeacher[];
  /** Active students on nobody's list. Nobody sees these on Today. */
  unassigned: { id: string; name: string; grade: number }[];
  /** Active students in the tuition, however many teachers each one has. */
  studentCount: number;
  sharedCount: number;
};

/**
 * Folds the links into one arrangement.
 *
 * Retired students are dropped: a retired child on nobody's list is not a
 * problem to be fixed, and leaving them in would make the unassigned list cry
 * wolf every time someone left the tuition.
 *
 * A teacher with no students is still listed. That is a real state worth
 * seeing — someone new, or someone whose students were all handed on.
 */
export function buildRoster(input: {
  teachers: { id: string; name: string }[];
  students: { id: string; name: string; grade: number; active: boolean }[];
  links: { teacherId: string; studentId: string }[];
  meId: string;
}): Roster {
  const active = new Map(
    input.students.filter((s) => s.active).map((s) => [s.id, s])
  );

  // How many lists each student sits on, counted before anything is grouped,
  // so "shared" means the same thing on every teacher's card.
  const listCount = new Map<string, number>();
  for (const l of input.links) {
    if (!active.has(l.studentId)) continue;
    listCount.set(l.studentId, (listCount.get(l.studentId) ?? 0) + 1);
  }

  const byTeacher = new Map<string, RosterStudent[]>();
  for (const l of input.links) {
    const s = active.get(l.studentId);
    if (!s) continue;
    const rows = byTeacher.get(l.teacherId) ?? [];
    // A duplicate link is impossible — teacher_students is keyed on the pair —
    // but a student must not appear twice on a card if that ever changes.
    if (rows.some((r) => r.id === s.id)) continue;
    rows.push({
      id: s.id,
      name: s.name,
      grade: s.grade,
      shared: (listCount.get(s.id) ?? 0) > 1,
    });
    byTeacher.set(l.teacherId, rows);
  }

  const byLevel = (a: { grade: number; name: string }, b: { grade: number; name: string }) =>
    a.grade - b.grade || a.name.localeCompare(b.name);

  const teachers: RosterTeacher[] = [...input.teachers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => ({
      id: t.id,
      name: t.name,
      isMe: t.id === input.meId,
      students: (byTeacher.get(t.id) ?? []).sort(byLevel),
    }));

  const unassigned = [...active.values()]
    .filter((s) => !listCount.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, grade: s.grade }))
    .sort(byLevel);

  return {
    teachers,
    unassigned,
    studentCount: active.size,
    sharedCount: [...listCount.values()].filter((n) => n > 1).length,
  };
}

/** The arrangement as a message, for whoever is not looking at the app. */
export function buildRosterText(roster: Roster): string {
  const lines: string[] = ["TUITION — WHO TEACHES WHOM", ""];

  for (const t of roster.teachers) {
    if (t.students.length === 0) {
      lines.push(`${t.name.toUpperCase()} — no students yet`);
      continue;
    }
    lines.push(`${t.name.toUpperCase()} — ${t.students.length}`);
    lines.push(...t.students.map((s) => `  ${s.name}`));
    lines.push("");
  }

  if (roster.unassigned.length > 0) {
    lines.push(
      `On nobody's list: ${list(roster.unassigned.map((s) => s.name))}.`
    );
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
