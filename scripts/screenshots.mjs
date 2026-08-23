/**
 * Wires screenshots into the web manifest.
 *
 *   1. Put PNG or JPEG captures in public/screenshots/
 *   2. npm run screenshots
 *
 * Sizes and form factors are read from the files themselves, because getting
 * either wrong is rejected at packaging time and the error message is unhelpful.
 * A portrait image is tagged narrow (phone), a landscape one wide (desktop) —
 * Play and the browser install prompt show different sets.
 *
 * The label comes from the filename: "01-today.png" -> "Today". That is what a
 * screen reader announces and what shows under the image in some install UIs,
 * so name the files after the screen.
 */
import sharp from "sharp";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = "public/screenshots";
const MANIFEST = "public/manifest.webmanifest";

let files = [];
try {
  files = (await readdir(DIR))
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort();
} catch {
  console.error(`No ${DIR}/ directory. Create it and add your captures first.`);
  process.exit(1);
}

if (files.length === 0) {
  console.error(`${DIR}/ is empty. Add PNG or JPEG captures of the app.`);
  process.exit(1);
}

function labelFor(file) {
  return path
    .basename(file, path.extname(file))
    .replace(/^\d+[-_]?/, "")        // strip a leading order prefix
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

const screenshots = [];
for (const file of files) {
  const meta = await sharp(path.join(DIR, file)).metadata();
  const { width, height } = meta;
  if (!width || !height) {
    console.error(`  skipped ${file}: could not read its dimensions`);
    continue;
  }
  const narrow = height >= width;
  screenshots.push({
    src: `/screenshots/${file}`,
    sizes: `${width}x${height}`,
    type: file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
    form_factor: narrow ? "narrow" : "wide",
    label: labelFor(file),
  });
  console.log(`  ${file}  ${width}x${height}  ${narrow ? "narrow" : "wide"}  "${labelFor(file)}"`);
}

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
manifest.screenshots = screenshots;
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

const narrow = screenshots.filter((s) => s.form_factor === "narrow").length;
console.log(`\n  wrote ${screenshots.length} screenshot(s) into ${MANIFEST}`);
if (narrow === 0) {
  console.log("  WARNING: no portrait captures. Play wants phone screenshots.");
}
