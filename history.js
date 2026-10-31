// Only extension pages and the worker import this module; never a website.
export const HISTORY_DAYS = 90;
const DB_NAME = "url-blocker-history";
const HOST_LIMIT = 200;
let opening;
let migrated = false;
export const localDate = (date = new Date()) => date.toLocaleDateString("en-CA");
export function oldestDate(now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() - HISTORY_DAYS + 1);
  return localDate(date);
}

function database() {
  return opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("days", { keyPath: "date" });
      request.result.createObjectStore("meta");
    };
    request.onerror = () => { opening = null; reject(request.error); };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = null; };
      resolve(db);
    };
  });
}
const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onabort = () => reject(tx.error ?? new Error("History transaction aborted."));
  tx.onerror = () => {}; // onabort reports failure after rollback
});
const validDate = (date) => Number.isFinite(new Date(`${date}T12:00:00Z`).getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
function cleanDay(value) {
  const result = {};
  for (const field of ["types", "hosts", "pages"])
    result[field] = Object.fromEntries(Object.entries(value?.[field] ?? {})
      .filter(([key, count]) => key && !["__proto__", "constructor", "prototype"].includes(key) &&
        Number.isSafeInteger(count) && count >= 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, field === "types" ? 50 : HOST_LIMIT));
  return result;
}

export async function migrateHistory() {
  migrated = false;
  const old = await chrome.storage.local.get(null);
  const keys = Object.keys(old).filter((key) => /^stats-\d{4}-\d{2}-\d{2}$/.test(key));
  const legacy = { ...old.blockStats };
  for (const key of keys) legacy[key.slice(6)] = old[key];
  const db = await database();
  const tx = db.transaction("days", "readwrite");
  const committed = done(tx);
  const days = tx.objectStore("days");
  const cutoff = oldestDate();
  days.delete(IDBKeyRange.upperBound(cutoff, true));
  for (const [date, value] of Object.entries(legacy)) {
    if (!validDate(date) || date < cutoff || date > localDate()) continue;
    const request = days.get(date);
    request.onsuccess = () => {
      if (!request.result) days.put({ date, ...cleanDay(value) });
    };
  }
  await committed;
  migrated = true;
  // If cleanup fails, a later migration sees the existing days and skips them.
  if (Object.hasOwn(old, "blockStats")) keys.push("blockStats");
  if (keys.length) await chrome.storage.local.remove(keys);
}

export async function readHistory(from = oldestDate(), to = localDate()) {
  if (!validDate(from) || !validDate(to) || from > to)
    throw new Error("Choose a valid history date range.");
  if (!migrated) await migrateHistory();
  const db = await database();
  const tx = db.transaction("days");
  const complete = done(tx);
  const request = tx.objectStore("days").getAll(IDBKeyRange.bound(from, to));
  await complete;
  return Object.fromEntries(request.result.map(({ date, ...counts }) => [date, counts]));
}

export async function appendHistory(entries, batchId) {
  // A failed first migration must recover before new counts can create a day
  // that would conceal older, still-unmigrated counts on the next startup.
  if (!migrated) await migrateHistory();
  const grouped = new Map();
  const cutoff = oldestDate();
  for (const entry of entries) {
    const date = localDate(new Date(entry.timestamp));
    if (!validDate(date) || date < cutoff || date > localDate()) continue;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(entry);
  }
  const db = await database();
  const tx = db.transaction(["days", "meta"], "readwrite");
  const committed = done(tx);
  const days = tx.objectStore("days");
  const meta = tx.objectStore("meta");
  const previous = meta.get("lastBatch");
  previous.onsuccess = () => {
    if (previous.result === batchId) return;
    days.delete(IDBKeyRange.upperBound(cutoff, true));
    for (const [date, batch] of grouped) {
      const request = days.get(date);
      request.onsuccess = () => {
        const day = cleanDay(request.result);
        for (const entry of batch)
          for (const [field, key] of [["types", entry.type], ["hosts", entry.host], ["pages", entry.page]])
            if (key && !["__proto__", "constructor", "prototype"].includes(key))
              day[field][key] = (day[field][key] ?? 0) + 1;
        days.put({ date, ...cleanDay(day) });
      };
    }
    meta.put(batchId, "lastBatch");
  };
  await committed;
}
