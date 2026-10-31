// Builds dist/url-blocker-<version>.zip with only the files the extension
// uses, for the Chrome Web Store. Run with `pnpm run package`.
// It zips the last commit (git archive), so uncommitted changes are left out
// and nothing from node_modules or test runs can slip in.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Everything in the repo that Chrome doesn't need
const DEV_ONLY = [
  "tests",
  "artifacts",
  "docs",
  "scripts",
  "*.md",
  "package.json",
  "pnpm-lock.yaml",
  "playwright.config.js",
  ".gitignore",
];
const runtimePaths = ["--", ".", ...DEV_ONLY.map((path) => `:(exclude)${path}`)];
try {
  execFileSync("git", ["diff", "--quiet", "HEAD", ...runtimePaths]);
} catch (error) {
  if (error.status !== 1) throw error;
  console.error("Commit runtime changes before packaging; git archive only includes HEAD.");
  process.exit(1);
}
// Both the filename and payload use the same committed version.
const { version } = JSON.parse(execFileSync("git", ["show", "HEAD:manifest.json"], { encoding: "utf8" }));
const output = `dist/url-blocker-${version}.zip`;

mkdirSync("dist", { recursive: true });
execFileSync("git", [
  "archive",
  "--format=zip",
  `--output=${output}`,
  "HEAD",
  ...runtimePaths,
]);
const hash = createHash("sha256").update(readFileSync(output)).digest("hex");
writeFileSync(`${output}.sha256`, `${hash}  url-blocker-${version}.zip\n`);

// ls-tree doesn't take :(exclude), so filter the same way by hand
const isDevOnly = (file) =>
  DEV_ONLY.some((path) =>
    path.startsWith("*") ? file.endsWith(path.slice(1)) : file === path || file.startsWith(`${path}/`)
  );
const files = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((file) => !isDevOnly(file));
console.log(`${output}: ${files.length} files\n  ${files.join("\n  ")}`);
console.log(`SHA-256: ${hash}`);
