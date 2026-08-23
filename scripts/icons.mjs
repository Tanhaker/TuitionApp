/**
 * Rasterises the app icon to the PNG sizes Android and the Play Store need.
 *
 *   node scripts/icons.mjs
 *
 * SVG alone is not enough: Android launchers and the Play listing will not
 * render an SVG, and PWABuilder rejects a manifest without a 192 and a 512 PNG.
 *
 * Two shapes are produced. The normal icon keeps its own rounded corners. The
 * maskable one is full-bleed with the artwork pulled into the middle ~60%,
 * because the OS crops a maskable icon to whatever shape it likes — a circle,
 * a squircle, a teardrop — and anything outside that safe zone is cut off.
 */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const INK = "#16233f";
const RULE = "#55607a";
const TEAL = "#12796b";

/** @param {{bleed?: boolean}} opts bleed = fill the canvas, for maskable. */
function svg({ bleed = false } = {}) {
  // Artwork occupies the middle 60% when maskable, the full tile otherwise.
  const s = bleed ? 0.6 : 1;
  const o = (512 - 512 * s) / 2;
  const t = `translate(${o} ${o}) scale(${s})`;
  const radius = bleed ? 0 : 96;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="${radius}" fill="${INK}"/>
  <g transform="${t}">
    <g stroke="${RULE}" stroke-width="10" stroke-linecap="round">
      <line x1="112" y1="196" x2="400" y2="196"/>
      <line x1="112" y1="268" x2="400" y2="268"/>
      <line x1="112" y1="340" x2="400" y2="340"/>
    </g>
    <path d="M150 262 l46 46 l116 -132" fill="none" stroke="${TEAL}" stroke-width="34"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const plain = Buffer.from(svg());
const bleed = Buffer.from(svg({ bleed: true }));

const targets = [
  { file: "public/icon-192.png", size: 192, src: plain },
  { file: "public/icon-512.png", size: 512, src: plain },
  { file: "public/icon-maskable-192.png", size: 192, src: bleed },
  { file: "public/icon-maskable-512.png", size: 512, src: bleed },
  // iOS ignores the manifest and uses this one; it must not be transparent.
  { file: "public/apple-touch-icon.png", size: 180, src: plain },
];

for (const { file, size, src } of targets) {
  const buf = await sharp(src).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(file, buf);
  console.log(`  ${file}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
}

// Keep the vector around: it stays crisp in the browser tab at any size.
await writeFile("public/icon.svg", svg());
console.log("  public/icon.svg  (vector, unchanged shape)");
