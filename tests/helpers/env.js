// Shared by the config, the fixture server and the specs
import { fileURLToPath } from "node:url";

export const PORT = Number(process.env.FIXTURE_PORT || 8791);
// The site under test and a different site for third-party content
export const FIRST = `http://127.0.0.1:${PORT}`;
export const THIRD = `http://localhost:${PORT}`;
// EXTENSION_UNDER_TEST points the suite at another copy, e.g. a deliberately
// broken one to check that the tests catch it
export const EXTENSION_DIR =
  process.env.EXTENSION_UNDER_TEST || fileURLToPath(new URL("../../", import.meta.url));
