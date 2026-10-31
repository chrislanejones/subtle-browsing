// Keep the public backup format unchanged while larger lists span sync items.
// Only extension pages and the service worker import this module.
export const LIST_KEYS = ["blockedUrls", "pausedSites", "siteSettings", "hiddenElements"];
const PREFIX = "list:";
const CACHE = "syncLastGood";
const FORMAT = "chunks-v1";
const encoder = new TextEncoder();
const bytes = (value) => encoder.encode(value).length;
const isDescriptor = (value) => value?.format === FORMAT && Array.isArray(value.chunks);
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))),
  (byte) => byte.toString(16).padStart(2, "0")).join("");
const chunkKey = (key, digest) => `${PREFIX}${key}:${digest}`;
const isWorker = typeof ServiceWorkerGlobalScope !== "undefined";
const incomplete = () => new Error("Saved rules are still syncing. Wait a moment, then try again.");

export function syncChanged(changes, keys = LIST_KEYS) {
  return keys.some((key) => changes[key] || Object.keys(changes).some((name) => name.startsWith(`${PREFIX}${key}:`)));
}

let reads = Promise.resolve();
export function readSync(keys = null, options = {}) {
  const result = reads.then(() => decodeSync(keys, options));
  reads = result.catch(() => {});
  return result;
}
async function decodeSync(keys, { strict = false } = {}) {
  const raw = await chrome.storage.sync.get(null);
  const cached = (await chrome.storage.local.get(CACHE))[CACHE] ?? {};
  const result = Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith(PREFIX)));
  const save = {};
  const selected = keys === null ? null : new Set(Array.isArray(keys) ? keys : [keys]);
  for (const key of LIST_KEYS) {
    if (selected && !selected.has(key)) continue;
    const value = raw[key];
    if (isDescriptor(value)) {
      try {
        if (!value.chunks.length || value.chunks.length > 64) throw incomplete();
        const chunks = await Promise.all(value.chunks.map(async (digest) => {
          const part = raw[chunkKey(key, digest)];
          if (typeof part !== "string" || await hash(part) !== digest) throw incomplete();
          return part;
        }));
        result[key] = JSON.parse(chunks.join(""));
        if (key === "siteSettings" ? !result[key] || Array.isArray(result[key]) || typeof result[key] !== "object" : !Array.isArray(result[key]))
          throw incomplete();
      } catch {
        if (strict || !Object.hasOwn(cached, key)) throw incomplete();
        result[key] = cached[key];
        continue;
      }
    }
    const complete = result[key] ?? (key === "siteSettings" ? {} : []);
    if ((Object.hasOwn(cached, key) || Object.hasOwn(result, key)) && JSON.stringify(cached[key]) !== JSON.stringify(complete))
      save[key] = complete;
  }
  // The worker serializes reads and mutations. UI readers never write a cache
  // from a potentially older snapshot over the worker's latest complete one.
  if (isWorker && Object.keys(save).length)
    await chrome.storage.local.set({ [CACHE]: { ...cached, ...save } }).catch((error) => console.warn(error.message));
  if (keys === null) return result;
  return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, result[key]]));
}

export async function writeSync(update) {
  // Mutations must never edit a fallback while newer cloud data is incomplete.
  await readSync(null, { strict: true });
  const before = await chrome.storage.sync.get(null);
  const encoded = { ...update };
  const retired = new Set();
  for (const key of LIST_KEYS) {
    if (!Object.hasOwn(update, key)) continue;
    const json = JSON.stringify(update[key]);
    if (bytes(key) + bytes(json) <= 7000) continue;
    const parts = [];
    let part = "", size = 0;
    for (const char of json) {
      // The chunk itself is a JSON string in sync, so quotes/backslashes count.
      const added = bytes(JSON.stringify(char)) - 2;
      if (size + added > 6000) { parts.push(part); part = ""; size = 0; }
      part += char; size += added;
    }
    if (part) parts.push(part);
    const digests = await Promise.all(parts.map(hash));
    digests.forEach((digest, i) => { encoded[chunkKey(key, digest)] = parts[i]; });
    encoded[key] = { format: FORMAT, chunks: digests };
  }
  for (const key of LIST_KEYS) {
    if (!Object.hasOwn(update, key) || !isDescriptor(before[key])) continue;
    const next = new Set(isDescriptor(encoded[key]) ? encoded[key].chunks : []);
    for (const digest of before[key].chunks) if (!next.has(digest)) {
      const name = chunkKey(key, digest);
      retired.add(name);
      encoded[name] = null;
    }
  }
  // Replace retired payloads in the SAME atomic write. Removing rules near
  // the quota must not require room for a second full copy of the list.
  // Quota errors leave every previous item intact.
  await chrome.storage.sync.set(encoded);
  await readSync();
  const raw = await chrome.storage.sync.get(null);
  const referenced = new Set(LIST_KEYS.flatMap((key) => isDescriptor(raw[key])
    ? raw[key].chunks.map((digest) => chunkKey(key, digest)) : []));
  // Never collect arbitrary unreferenced chunks: cloud sync may deliver new
  // chunks before their descriptor. Only remove our own retired tombstones.
  const obsolete = [...retired].filter((key) => raw[key] === null && !referenced.has(key));
  if (obsolete.length) await chrome.storage.sync.remove(obsolete).catch((error) => console.warn(error.message));
}

export function onSyncChanged(keys, callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && syncChanged(changes, keys))
      readSync(keys).then(callback).catch((error) => console.warn(error.message));
  });
}
