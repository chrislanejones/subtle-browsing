// Export the generated master as Chrome-compatible transparent PNGs.
// Requires ImageMagick 7 (`magick`); run `pnpm run icons` from the repo root.
import { execFileSync } from "node:child_process";

const master = "docs/store/branding/shield/master.png";
// Toolbar sizes use more of their canvas. The store export follows Google's
// 96px artwork / 128px canvas guidance, with at least 16px transparent padding.
for (const [size, artwork] of [[16, 14], [32, 28], [48, 42], [128, 96]]) {
  const output = `images/icon${size}.png`;
  execFileSync("magick", [
    master, "-fuzz", "5%", "-trim", "+repage", "-filter", "Lanczos",
    "-resize", `${artwork}x${artwork}`,
    "-background", "none", "-gravity", "center",
    "-extent", `${size}x${size}`, "-strip", `PNG32:${output}`,
  ]);
  console.log(output);
}
