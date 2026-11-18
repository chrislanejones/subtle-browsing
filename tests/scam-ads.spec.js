import { readFile } from "node:fs/promises";
import { test, expect } from "./helpers/extension.js";

const scam = JSON.parse(await readFile(new URL("../rules/scam-ads.json", import.meta.url)));
const annoyances = JSON.parse(await readFile(new URL("../rules/annoyances.json", import.meta.url)));
const host = (rule) => rule.condition.urlFilter.replace(/^\|\|/, "").replace(/[\^/*].*$/, "");
// A URL each filter should catch: "||a.com^" -> https://a.com/x, "||b.com/*c=" -> https://b.com/in/?c=1
const sample = (rule) => rule.condition.urlFilter
  .replace(/^\|\|/, "https://").replace(/\^$/, "/x").replace("*", "in/?").replace(/=$/, "=1");

test("scam ad hosts are blocked on a fresh install, on any site", async ({ ext }) => {
  const result = await ext.sw.evaluate(async (urls) => {
    const matched = async (url, type) =>
      (await chrome.declarativeNetRequest.testMatchOutcome({ url, initiator: "https://news.example", type }))
        .matchedRules.map((r) => r.rulesetId);
    return {
      frames: await Promise.all(urls.map((url) => matched(url, "sub_frame"))),
      landing: await matched("https://www.oceanpoet.com/warning", "main_frame"),
      ordinary: await matched("https://news.example/app.js", "script"),
    };
  }, scam.map(sample));
  expect(result.frames).toEqual(scam.map(() => ["scam_ads"]));
  expect(result.landing).toEqual(["scam_ads"]);
  expect(result.ordinary).toEqual([]);
});

test("the newsletter list only carries newsletter tools", async () => {
  const scamHosts = new Set(scam.map(host));
  expect(annoyances.filter((rule) => scamHosts.has(host(rule)))).toEqual([]);
});

test("the Scam ads switch is on by default and turning it off removes the list", async ({ ext, page }) => {
  await page.goto(ext.url("popup.html"));
  await expect(page.locator("#scamAdsToggle")).toBeChecked();
  await page.locator("#scamAdsToggle").uncheck();
  await expect.poll(() => ext.enabledRulesets()).not.toContain("scam_ads");
  await page.goto(ext.url("options.html"));
  await expect(page.locator("#scamAdsToggle")).not.toBeChecked();
  await page.locator("#scamAdsToggle").check();
  await expect.poll(() => ext.enabledRulesets()).toContain("scam_ads");
});
