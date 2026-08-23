// Relative with an explicit extension so Node's test runner can resolve this
// module directly, without the bundler's "@/" alias.
import { fromISO } from "./dates.ts";
import { gradeLabel } from "./grades.ts";

/**
 * Builds the written export — the register as prose rather than a spreadsheet.
 *
 * Kept out of the page and out of the download button so the wording can be
 * read and tested on its own. The CSV is for a spreadsheet; this is for a human
 * reading it, or for handing a parent a record of what their child covered.
 */

export type ReportSubject = {
  name: string;
  count: number;
  /** Chapters covered, in the order they were taught, de-duplicated. */
  chapters: string[];
  /** Last date this subject was taught inside the window. */
  last: string | null;
};

export type ReportStudent = {
  name: string;
  grade: number;
  school: string | null;
  total: number;
  subjects: ReportSubject[];
  /** Days marked in this window. Unmarked days count as neither. */
  attendance?: { present: number; absent: number };
};

export type ReportMeta = {
  teacherName: string;
  from: string;
  to: string;
  /** true when the report covers only this teacher's own lessons. */
  mine: boolean;
  /** true when from and to are the same day: reads as a daily note instead. */
  singleDay?: boolean;
  /** Students on the list with no lessons in this window; named, not detailed. */
  notTaught: string[];
  /** Students who were marked absent — a different thing from a missed lesson. */
  absent?: string[];
};

/** "20 August" — the year lives in the header, so it is not repeated per line. */
function day(iso: string): string {
  return fromISO(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long" });
}

/** "20 August 2026" */
function dayYear(iso: string): string {
  return fromISO(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "Thursday 20 August 2026" — the daily report leads with the weekday. */
function weekdayFull(iso: string): string {
  return fromISO(iso).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** ["a"] -> "a";  ["a","b"] -> "a and b";  ["a","b","c"] -> "a, b and c" */
function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

function times(n: number): string {
  return n === 1 ? "once" : `${n} times`;
}

function sessions(n: number): string {
  return n === 1 ? "1 session" : `${n} sessions`;
}

/** Wrap prose at a width that survives being pasted into WhatsApp or a letter. */
function wrap(text: string, width = 68): string {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length <= width) {
      out.push(paragraph);
      continue;
    }
    let line = "";
    for (const word of paragraph.split(" ")) {
      if (line && (line + " " + word).length > width) {
        out.push(line);
        line = word;
      } else {
        line = line ? line + " " + word : word;
      }
    }
    if (line) out.push(line);
  }
  return out.join("\n");
}

export function buildTextReport(meta: ReportMeta, students: ReportStudent[]): string {
  const lines: string[] = [];

  lines.push(meta.singleDay ? "DAILY REGISTER" : "TUITION REGISTER");
  lines.push(
    meta.singleDay
      ? `${meta.teacherName}  |  ${weekdayFull(meta.to)}`
      : `${meta.teacherName}  |  ${dayYear(meta.from)} to ${dayYear(meta.to)}`
  );
  lines.push(
    meta.mine
      ? "Only lessons taught by you are included."
      : "Includes lessons taught by every teacher."
  );
  lines.push("");

  if (students.length === 0) {
    lines.push(
      wrap(
        meta.singleDay
          ? meta.mine
            ? "You logged no lessons on this day."
            : "No lessons were logged on this day."
          : meta.mine
            ? "You have not logged any lessons in this period."
            : "No lessons were logged in this period."
      )
    );
  }

  for (const s of students) {
    lines.push("");
    const where = s.school ? `${gradeLabel(s.grade)}, ${s.school}` : gradeLabel(s.grade);
    lines.push(`${s.name.toUpperCase()} - ${where}`);
    lines.push("");

    const first = s.name.split(" ")[0];

    if (meta.singleDay) {
      // One day needs no date framing and no "last lesson was on" — the date is
      // in the header and every lesson happened on it. Just say what was taught.
      lines.push(
        wrap(
          meta.mine
            ? `You taught ${first} ${list(s.subjects.map((sub) => sub.name))}.`
            : `${first} was taught ${list(s.subjects.map((sub) => sub.name))}.`
        )
      );
      lines.push("");
      for (const sub of s.subjects) {
        lines.push(
          sub.chapters.length > 0
            ? `  ${sub.name} - ${list(sub.chapters)}`
            : `  ${sub.name} - no chapter recorded`
        );
      }
      lines.push("");
      continue;
    }

    lines.push(
      wrap(
        meta.mine
          ? `Between ${day(meta.from)} and ${day(meta.to)} you taught ${first} ${times(s.total)}.`
          : `Between ${day(meta.from)} and ${day(meta.to)} ${first} was taught ${times(s.total)}.`
      )
    );

    const att = s.attendance;
    if (att && att.present + att.absent > 0) {
      const days = att.present + att.absent;
      lines.push("");
      lines.push(
        wrap(
          att.absent === 0
            ? `${first} attended all ${days} day${days === 1 ? "" : "s"} that were marked.`
            : `${first} was present on ${att.present} of ${days} marked day${
                days === 1 ? "" : "s"
              }, absent ${att.absent === 1 ? "once" : `${att.absent} times`}.`
        )
      );
    }

    for (const sub of s.subjects) {
      lines.push("");
      const head = `In ${sub.name} (${sessions(sub.count)})`;
      const body =
        sub.chapters.length > 0
          ? meta.mine
            ? `${head} you covered ${list(sub.chapters)}.`
            : `${head} the class covered ${list(sub.chapters)}.`
          : `${head} no chapters were recorded.`;
      const tail = sub.last ? ` The last lesson was on ${day(sub.last)}.` : "";
      lines.push(wrap(body + tail));
    }

    lines.push("");
  }

  if (meta.absent && meta.absent.length > 0) {
    lines.push("");
    lines.push(meta.singleDay ? "ABSENT" : "ABSENT, NO LESSONS");
    lines.push("");
    lines.push(
      wrap(
        meta.singleDay
          ? `${list(meta.absent)} ${
              meta.absent.length === 1 ? "was" : "were"
            } marked absent on ${day(meta.to)}.`
          : `${list(meta.absent)} ${
              meta.absent.length === 1 ? "was" : "were"
            } marked absent and had no lessons in this period.`
      )
    );
    lines.push("");
  }

  if (meta.notTaught.length > 0) {
    lines.push("");
    lines.push(meta.singleDay ? "NOT TAUGHT ON THIS DAY" : "NOT TAUGHT BY YOU IN THIS PERIOD");
    lines.push("");
    lines.push(
      wrap(
        meta.singleDay
          ? `${list(meta.notTaught)} ${
              meta.notTaught.length === 1 ? "was" : "were"
            } not taught by you on ${day(meta.to)}.`
          : `${list(meta.notTaught)} ${
              meta.notTaught.length === 1 ? "is" : "are"
            } on your list but you logged no lessons for them between ${day(
              meta.from
            )} and ${day(meta.to)}.`
      )
    );
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
