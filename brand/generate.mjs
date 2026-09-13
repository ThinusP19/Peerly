// Regenerates every brand asset from the SVG sources in this folder.
//   node brand/generate.mjs
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "../public");

// favicon.svg      transparent, follows the OS light/dark theme - modern tabs
// mark-small.svg   transparent, fixed mid purple - bitmap favicons (16–48px)
// mark.svg         on its plum tile - home-screen icons, because iOS and
//                  Android fill a transparent icon with black
const favicon = await readFile(join(here, "favicon.svg"));
const markSmall = await readFile(join(here, "mark-small.svg"));
const mark = await readFile(join(here, "mark.svg"));

const png = (size) =>
  sharp(size <= 48 ? markSmall : mark, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 });

// Favicons. The .ico carries 16/32/48 so older browsers and Windows pick a
// crisp size instead of downsampling one bitmap badly.
await writeFile(join(pub, "favicon.svg"), favicon);
for (const size of [16, 32, 48, 180, 192, 512]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  await png(size).toFile(join(pub, name));
}
await writeFile(
  join(pub, "favicon.ico"),
  await pngToIco([16, 32, 48].map((s) => join(pub, `icon-${s}.png`))),
);

// Social share card.
const og = await readFile(join(here, "og.svg"));
await sharp(og, { density: 144 })
  .resize(1200, 630)
  .png({ compressionLevel: 9 })
  .toFile(join(pub, "og-image.png"));

console.log(
  "Wrote favicon.svg, favicon.ico, icon-{16,32,48,192,512}.png, apple-touch-icon.png, og-image.png",
);
