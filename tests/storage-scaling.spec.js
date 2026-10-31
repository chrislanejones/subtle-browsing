import { test, expect } from "./helpers/extension.js";
import { FIRST } from "./helpers/env.js";

const data = () => ({
  blockedUrls: Array.from({ length: 450 }, (_, i) => `blocked-${i}.example.com`),
  pausedSites: Array.from({ length: 400 }, (_, i) => `paused-${i}.example.com`),
  siteSettings: Object.fromEntries(Array.from({ length: 210 }, (_, i) => [`custom-${i}.example.com`, { autoplayGuard: false, heavyAds: false }])),
  hiddenElements: Array.from({ length: 160 }, (_, i) => ({ site: "127.0.0.1", selector: `.広告-${i}-${"猫".repeat(12)}` })),
});
const mutate = (ext, operation, data) => ext.sendMessage({ action: "mutate", operation, data });
const read = async (ext, keys = null) => (await ext.messenger()).evaluate(async (keys) =>
  (await import("./sync-storage.js")).readSync(keys), keys);

test("all four large lists save beyond 8 KB, apply, export and remain editable", async ({ ext, page }) => {
  const lists = data();
  expect((await mutate(ext, "importBackup", lists)).error).toBeUndefined();
  expect(await read(ext, Object.keys(lists))).toEqual(lists);
  const raw = await ext.getSync();
  for (const key of Object.keys(lists)) expect(raw[key].format).toBe("chunks-v1");
  expect((await ext.dynamicRules()).filter((rule) => rule.action.type === "block")).toHaveLength(450);
  expect(await ext.sw.evaluate(() => chrome.storage.sync.getBytesInUse(null))).toBeLessThan(102400);
  for (const key of Object.keys(raw))
    expect(Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(raw[key])), key).toBeLessThan(8192);

  await page.goto(`${FIRST}/index.html`);
  await page.evaluate((selector) => {
    const node = document.createElement("div");
    node.id = "hidden-test"; node.className = selector.slice(1); node.textContent = "A hidden ad";
    document.body.append(node);
  }, lists.hiddenElements[0].selector);
  await expect(page.locator("#hidden-test")).toBeHidden();

  await page.goto(ext.url("options.html"));
  await expect(page.locator("#urlList .url-item")).toHaveCount(450);
  const download = page.waitForEvent("download");
  await page.locator("#exportButton").click();
  const saved = await download;
  const stream = await saved.createReadStream();
  let json = ""; for await (const chunk of stream) json += chunk;
  const backup = JSON.parse(json);
  for (const key of Object.keys(lists)) expect(backup[key]).toEqual(lists[key]);

  expect((await mutate(ext, "removeUrl", { url: lists.blockedUrls[0] })).error).toBeUndefined();
  expect((await mutate(ext, "pauseSite", { site: lists.pausedSites[0], paused: false })).error).toBeUndefined();
  expect((await mutate(ext, "resetSite", { site: Object.keys(lists.siteSettings)[0] })).error).toBeUndefined();
  expect((await mutate(ext, "unhide", lists.hiddenElements[0])).error).toBeUndefined();
  await expect(page.locator("#urlList .url-item")).toHaveCount(449);
  const after = await read(ext);
  expect(after.blockedUrls).toEqual(lists.blockedUrls.slice(1));
  expect(after.pausedSites).toEqual(lists.pausedSites.slice(1));
  expect(after.hiddenElements).toEqual(lists.hiddenElements.slice(1));
  expect(Object.keys(after.siteSettings)).toHaveLength(209);
});

test("out-of-order or damaged sync keeps complete rules and rejects edits until repaired", async ({ ext }) => {
  const lists = { blockedUrls: data().blockedUrls };
  await mutate(ext, "importBackup", lists);
  const complete = await ext.getSync();
  const key = Object.keys(complete).find((key) => key.startsWith("list:blockedUrls:"));
  await ext.sw.evaluate((key) => chrome.storage.sync.remove(key), key);
  expect((await read(ext)).blockedUrls).toEqual(lists.blockedUrls);
  expect((await mutate(ext, "blockUrl", { url: "new.example" })).error).toContain("still syncing");
  expect((await ext.dynamicRules()).filter((rule) => rule.action.type === "block")).toHaveLength(450);
  await ext.setSync({ [key]: "damaged" });
  expect((await read(ext)).blockedUrls).toEqual(lists.blockedUrls);
  await ext.setSync({ [key]: complete[key] });
  expect((await mutate(ext, "blockUrl", { url: "new.example" })).error).toBeUndefined();
  expect((await read(ext)).blockedUrls).toEqual([...lists.blockedUrls, "new.example"]);
  const raw = await ext.getSync();
  const referenced = raw.blockedUrls.chunks.map((hash) => `list:blockedUrls:${hash}`);
  expect(Object.keys(raw).filter((key) => key.startsWith("list:")).sort()).toEqual(referenced.sort());
});

test("a real total-quota rejection leaves every prior list and setting intact", async ({ ext }) => {
  await mutate(ext, "importBackup", { blockedUrls: [...data().blockedUrls, "keep.example"], settings: { autoplayGuard: false } });
  const before = await ext.getSync();
  const enormous = Array.from({ length: 6000 }, (_, i) => `rule-${i}-${"x".repeat(25)}.example.com`);
  const result = await mutate(ext, "importBackup", { blockedUrls: enormous, settings: { autoplayGuard: true } });
  expect(result.error).toContain("Chrome sync storage is full");
  expect(await ext.getSync()).toEqual(before);
  expect((await ext.dynamicRules()).filter((rule) => rule.action.type === "block")).toHaveLength(451);
});

test("concurrent edits from two windows preserve both changes to a chunked list", async ({ ext, context }) => {
  const urls = data().blockedUrls;
  await mutate(ext, "importBackup", { blockedUrls: urls });
  const windows = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all(windows.map((page) => page.goto(ext.url("popup.html"))));
  await Promise.all(windows.map((page, i) => page.evaluate(async (i) =>
    (await import("./blocklist.js")).addBlockedUrl(`simultaneous-${i}.example`), i)));
  expect((await read(ext)).blockedUrls).toEqual(expect.arrayContaining([...urls, "simultaneous-0.example", "simultaneous-1.example"]));
  expect((await read(ext)).blockedUrls).toHaveLength(urls.length + 2);
});

test("chunks arriving before their descriptor survive an unrelated local edit", async ({ ext }) => {
  const urls = data().blockedUrls;
  await mutate(ext, "importBackup", { blockedUrls: urls });
  const older = await ext.getSync();
  await mutate(ext, "blockUrl", { url: "arriving.example" });
  const newer = await ext.getSync();
  await ext.setSync(older);
  const chunks = Object.fromEntries(Object.entries(newer).filter(([key]) => key.startsWith("list:")));
  await ext.setSync(chunks);
  await mutate(ext, "settings", { changes: { autoplayGuard: false } });
  const waiting = await ext.getSync();
  for (const [key, value] of Object.entries(chunks)) expect(waiting[key]).toEqual(value);
  await ext.setSync({ blockedUrls: newer.blockedUrls });
  expect((await read(ext)).blockedUrls).toEqual([...urls, "arriving.example"]);
});

test("removing rules near the total quota does not require a second copy", async ({ ext }) => {
  const urls = Array.from({ length: 4000 }, (_, i) => `large-${i}.example`);
  expect((await mutate(ext, "importBackup", { blockedUrls: urls })).error).toBeUndefined();
  expect(await ext.sw.evaluate(() => chrome.storage.sync.getBytesInUse(null))).toBeGreaterThan(80000);
  expect((await mutate(ext, "removeUrl", { url: urls[0] })).error).toBeUndefined();
  expect((await read(ext)).blockedUrls).toEqual(urls.slice(1));
  expect((await ext.dynamicRules()).filter((rule) => rule.action.type === "block")).toHaveLength(3999);
});
