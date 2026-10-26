// Builds dist/url-blocker-<version>.zip with only the files the extension
// uses, for the Chrome Web Store. Run with `pnpm run package`.
// It zips the last commit (git archive), so uncommitted changes are left out
// and nothing from node_modules or test runs can slip in.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("manifest.json", "utf8"));
const output = `dist/url-blocker-${version}.zip`;

// Everything in the repo that Chrome doesn't need
const DEV_ONLY = [
  "tests",
  "docs",
  "scripts",
  "*.md",
  "package.json",
  "pnpm-lock.yaml",
  "playwright.config.js",
  ".gitignore",
];

mkdirSync("dist", { recursive: true });
execFileSync("git", [
  "archive",
  "--format=zip",
  `--output=${output}`,
  "HEAD",
  "--",
  ".",
  ...DEV_ONLY.map((path) => `:(exclude)${path}`),
]);

const files = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "--", ".", ...DEV_ONLY.map((path) => `:(exclude)${path}`)], { encoding: "utf8" })
  .trim()
  .split("\n");
console.log(`${output}: ${files.length} files\n  ${files.join("\n  ")}`);
