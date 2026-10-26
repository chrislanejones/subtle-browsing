// Fixture server for the end-to-end tests. One server, two sites:
// http://127.0.0.1:PORT is "the page" and http://localhost:PORT is "the third
// party", so the extension's cross-site logic sees two different sites.
//
// HTML files can use __FIRST__ and __THIRD__, replaced with those two origins.
// Every response sends Content-Length (the heavy ad counter reads it) and
// no-store, so a cached response never skips the extension's request hooks.
// /big.bin (5 MB) and /half.bin (2.5 MB) are generated in memory.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { FIRST, PORT, THIRD } from "./helpers/env.js";

const SITE_DIR = fileURLToPath(new URL("./site/", import.meta.url));
const BIG_BODY = Buffer.alloc(5 * 1024 * 1024, 7);
const HALF_BODY = BIG_BODY.subarray(0, BIG_BODY.length / 2);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webm": "video/webm",
  ".json": "application/json",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

// Media elements ask for byte ranges
function sendWithRange(req, res, body, type) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (!match) {
    send(res, 200, body, { "Content-Type": type, "Accept-Ranges": "bytes" });
    return;
  }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
  if (start > end || start >= body.length) {
    send(res, 416, Buffer.alloc(0), { "Content-Range": `bytes */${body.length}` });
    return;
  }
  send(res, 206, body.subarray(start, end + 1), {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Content-Range": `bytes ${start}-${end}/${body.length}`,
  });
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://fixture");
  if (pathname === "/health") return send(res, 200, Buffer.from("ok"));
  if (pathname === "/big.bin") {
    return send(res, 200, BIG_BODY, { "Content-Type": "application/octet-stream" });
  }
  if (pathname === "/half.bin") {
    return send(res, 200, HALF_BODY, { "Content-Type": "application/octet-stream" });
  }

  const file = normalize(join(SITE_DIR, pathname === "/" ? "index.html" : pathname));
  if (!file.startsWith(SITE_DIR)) return send(res, 403, Buffer.from("forbidden"));
  let body;
  try {
    body = await readFile(file);
  } catch {
    return send(res, 404, Buffer.from("not found"));
  }
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  if (extname(file) === ".html") {
    body = Buffer.from(
      body
        .toString("utf8")
        .replaceAll("__FIRST__", FIRST)
        .replaceAll("__THIRD__", THIRD)
    );
  }
  sendWithRange(req, res, body, type);
});

// No host: listens on both IPv4 and IPv6, so localhost works either way
server.listen(PORT, () => console.log(`fixture server on ${PORT}`));
