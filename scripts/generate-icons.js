// Export the generated master as Chrome-compatible PNGs on a white rounded tile,
// so the dark teal shield stays visible on dark toolbars.
// Requires ImageMagick 7 (`magick`); run `pnpm run icons` from the repo root.
import { execFileSync } from "node:child_process";

const master = "docs/store/branding/shield/master.png";
// Toolbar sizes fill their canvas with the tile. The store export follows
// Google's 96px artwork / 128px canvas guidance, with 16px transparent padding.
for (const [size, tile, shield, radius] of [
  [16, 16, 12, 3],
  [32, 32, 24, 6],
  [48, 48, 36, 9],
  [128, 96, 74, 18],
]) {
  const output = `images/icon${size}.png`;
  execFileSync("magick", [
    "-size", `${tile}x${tile}`, "xc:none", "-fill", "white",
    "-draw", `roundrectangle 0,0,${tile - 1},${tile - 1},${radius},${radius}`,
    "(", master, "-fuzz", "5%", "-trim", "+repage", "-filter", "Lanczos",
    "-resize", `${shield}x${shield}`, ")",
    "-gravity", "center", "-composite",
    "-background", "none", "-extent", `${size}x${size}`,
    "-strip", `PNG32:${output}`,
  ]);
  console.log(output);
}
