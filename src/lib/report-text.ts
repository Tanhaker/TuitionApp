import { fromISO } from "@/lib/dates";

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
};

export type ReportMeta = {
  teacherName: string;
  from: string;
  to: string;
  /** true when the report covers only this teacher's own lessons. */
  mine: boolean;
  /** Students on the list with no lessons in this window; named, not detailed. */
  notTaught: string[];
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

  lines.push("TUITION REGISTER");
  lines.push(
    `${meta.teacherName}  |  ${dayYear(meta.from)} to ${dayYear(meta.to)}`
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
        meta.mine
          ? "You have not logged any lessons in this period."
          : "No lessons were logged in this period."
      )
    );
  }

  for (const s of students) {
    lines.push("");
    const where = s.school ? `Class ${s.grade}, ${s.school}` : `Class ${s.grade}`;
    lines.push(`${s.name.toUpperCase()} - ${where}`);
    lines.push("");

    const first = s.name.split(" ")[0];
    lines.push(
      wrap(
        meta.mine
          ? `Between ${day(meta.from)} and ${day(meta.to)} you taught ${first} ${times(s.total)}.`
          : `Between ${day(meta.from)} and ${day(meta.to)} ${first} was taught ${times(s.total)}.`
      )
    );

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

  if (meta.notTaught.length > 0) {
    lines.push("");
    lines.push("NOT TAUGHT BY YOU IN THIS PERIOD");
    lines.push("");
    lines.push(
      wrap(
        `${list(meta.notTaught)} ${
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
