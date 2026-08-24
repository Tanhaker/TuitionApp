/**
 * Shared shaping for the plain-text exports.
 *
 * Both the coverage report and the day board end up in the same place — pasted
 * into a message on somebody's phone — so they wrap the same way and join names
 * the same way. Kept here rather than in either builder so the two cannot drift.
 */

/** ["a"] -> "a";  ["a","b"] -> "a and b";  ["a","b","c"] -> "a, b and c" */
export function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

/** Wrap prose at a width that survives being pasted into WhatsApp or a letter. */
export function wrap(text: string, width = 68): string {
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
