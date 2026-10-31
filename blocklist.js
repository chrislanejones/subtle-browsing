import { readSync, onSyncChanged } from "./sync-storage.js";
import { mutate } from "./storage-client.js";
const STORAGE_KEY = "blockedUrls";
export const SYNC_FULL_MESSAGE =
  "Chrome sync storage is full. Export a backup, then remove some saved rules and try again.";

function webUrl(value) {
  if (/\s/.test(value))
    throw new Error("URLs cannot contain spaces. Use %20 in a path.");
  const url = new URL(
    /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`,
  );
  if (
    !/^https?:$/.test(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  )
    throw new Error(
      "Enter an HTTP or HTTPS URL without a username or password.",
    );
  url.hash = "";
  return url;
}
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Explicit prefixes preserve the mode in backups. Legacy host/path entries
// still work, but now have host boundaries instead of substring matching.
export function normalizeUrl(input, mode = "auto") {
  if (typeof input !== "string") throw new Error("Enter a domain or URL.");
  let value = input.trim();
  if (!value) return "";
  if (value.length > 2000)
    throw new Error("Use a rule shorter than 2,000 characters.");
  if (value.startsWith("url:")) {
    mode = "exact";
    value = value.slice(4);
  }
  if (value.startsWith("pattern:")) {
    mode = "pattern";
    value = value.slice(8);
  }
  if (mode === "pattern") {
    if (!value || !/^[\x21-\x7e]+$/.test(value))
      throw new Error("Patterns must use ASCII characters without spaces.");
    return `pattern:${value}`;
  }
  if (!["auto", "domain", "exact"].includes(mode))
    throw new Error("Choose a matching mode.");
  if (/[|^*]/.test(value))
    throw new Error(
      "Choose Advanced pattern to use wildcards or filter syntax.",
    );
  let url;
  try {
    url = webUrl(value);
  } catch (error) {
    throw new Error(
      error.message.startsWith("Invalid")
        ? "Enter a valid domain or HTTP(S) URL."
        : error.message,
    );
  }
  if (mode === "auto")
    mode =
      url.pathname === "/" && !url.search && !url.port ? "domain" : "exact";
  if (mode === "domain") {
    if (url.port) throw new Error("Use Exact URL to include a port.");
    return url.hostname.replace(/^www\./, "");
  }
  return `url:${url.href}`;
}
export function normalizeImportedRule(input) {
  if (typeof input !== "string" || !input.trim()) return "";
  const value = input.trim();
  if (value.startsWith("url:") || value.startsWith("pattern:"))
    return normalizeUrl(value);
  if (/[|^*]/.test(value)) return normalizeUrl(value, "pattern");
  const url = webUrl(value);
  if (
    !/^[a-z][a-z\d+.-]*:\/\//i.test(value) &&
    (url.pathname !== "/" || url.search || url.port)
  )
    return url.host + url.pathname + url.search;
  return normalizeUrl(value);
}

export function ruleCondition(entry) {
  try {
    if (entry.startsWith("pattern:"))
      return { urlFilter: normalizeUrl(entry).slice(8) };
    if (entry.startsWith("url:"))
      return {
        regexFilter: `^${escapeRegex(webUrl(entry.slice(4)).href)}$`,
        isUrlFilterCaseSensitive: true,
      };
    if (/[|^*]/.test(entry))
      return /^[\x21-\x7e]+$/.test(entry) ? { urlFilter: entry } : null;
    const url = webUrl(entry);
    if (url.pathname === "/" && !url.search && !url.port)
      return { urlFilter: `||${url.hostname.replace(/^www\./, "")}^` };
    return {
      regexFilter: `^https?://${escapeRegex(url.host + url.pathname + url.search)}$`,
      isUrlFilterCaseSensitive: true,
    };
  } catch {
    return null;
  }
}
export function ruleLabel(entry) {
  return entry.startsWith("url:")
    ? entry.slice(4)
    : entry.startsWith("pattern:")
      ? `Pattern: ${entry.slice(8)}`
      : entry;
}
export function rulePreview(input, mode) {
  const value = normalizeUrl(input, mode);
  if (!value) return "";
  if (value.startsWith("pattern:"))
    return `Advanced filter: ${value.slice(8)}. Can match across sites; * is a wildcard, || anchors a hostname, | anchors a URL edge.`;
  if (value.startsWith("url:"))
    return `Only ${value.slice(4)}. Scheme, host, path and query must match; fragments are ignored.`;
  return `${value} and its subdomains, on every site. Paths are not restricted.`;
}
export async function getBlockedUrls() {
  return (await readSync(STORAGE_KEY))[STORAGE_KEY] ?? [];
}
export async function addBlockedUrl(url, mode = "auto") {
  return (await mutate("blockUrl", { url, mode })).added;
}
export async function removeBlockedUrl(url) {
  return mutate("removeUrl", { url });
}
export function onBlockedUrlsChanged(callback) {
  onSyncChanged([STORAGE_KEY], (data) => callback(data[STORAGE_KEY] ?? []));
}
