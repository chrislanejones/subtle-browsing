// 1.5.0 moved the block list, paused sites and switches from storage.local to
// storage.sync. These tests install a copy of the extension labeled 1.4.0,
// leave 1.4.0-style data in local storage, then update the copy to 1.5.0 in
// the same profile, the way Chrome updates an installed extension.

import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { EXTENSION_DIR } from "./helpers/env.js";
import {
  DEFAULT_SETTINGS,
  expectedRulesets,
  launchExtension,
  setBadgeWindow,
  waitForInstall,
  watchErrors,
  makeHelpers,
} from "./helpers/extension.js";

async function copyExtension(target) {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: EXTENSION_DIR, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  for (const file of files) {
    await mkdir(dirname(join(target, file)), { recursive: true });
    await copyFile(join(EXTENSION_DIR, file), join(target, file));
  }
}

async function setVersion(extensionDir, version) {
  const path = join(extensionDir, "manifest.json");
  const manifest = JSON.parse(await readFile(path, "utf8"));
  manifest.version = version;
  await writeFile(path, JSON.stringify(manifest, null, 2));
}

const today = () => new Date().toLocaleDateString("en-CA");

// Installs "1.4.0", writes `local` and `sync`, updates to 1.5.0 and hands the
// relaunched worker to `check`
async function upgrade(testInfo, { local, sync = {}, settingsAfter }, check) {
  const extensionDir = testInfo.outputPath("extension");
  const profileDir = testInfo.outputPath("profile");
  await copyExtension(extensionDir);
  await setVersion(extensionDir, "1.4.0");

  {
    const { context, sw } = await launchExtension(profileDir, extensionDir);
    const errors = watchErrors(context);
    await waitForInstall(sw);
    expect(await sw.evaluate(() => chrome.runtime.getManifest().version)).toBe(
      "1.4.0",
    );
    await sw.evaluate(
      ([l, s]) =>
        Promise.all([chrome.storage.local.set(l), chrome.storage.sync.set(s)]),
      [local, sync],
    );
    // Let the worker finish applying what landed in sync before closing
    await waitForInstall(sw, { ...DEFAULT_SETTINGS, ...sync.settings });
    const ruleCount =
      (sync.blockedUrls?.length ?? 0) + (sync.pausedSites?.length ? 1 : 0);
    await expect
      .poll(() =>
        sw.evaluate(
          async () =>
            (await chrome.declarativeNetRequest.getDynamicRules()).length,
        ),
      )
      .toBe(ruleCount);
    const found = [...errors];
    await context.close();
    expect(found).toEqual([]);
  }

  await setVersion(extensionDir, "1.5.0");

  const { context, sw } = await launchExtension(profileDir, extensionDir);
  const errors = watchErrors(context);
  let found = [];
  try {
    await waitForInstall(sw, settingsAfter);
    expect(await sw.evaluate(() => chrome.runtime.getManifest().version)).toBe(
      "1.5.0",
    );
    await check(sw);
  } finally {
    found = [...errors]; // before closing, which cuts off work in progress
    await context.close();
  }
  expect(found).toEqual([]);
}

const ruleSummary = (sw) =>
  sw.evaluate(async () =>
    (await chrome.declarativeNetRequest.getDynamicRules()).map((r) => [
      r.action.type,
      r.condition.urlFilter ?? r.condition.requestDomains,
    ]),
  );

test("updating from 1.4.0 moves local settings to sync and rebuilds the rules", async ({}, testInfo) => {
  const oldSettings = {
    ...DEFAULT_SETTINGS,
    annoyanceRules: true,
    heavyAds: false,
  };
  const local = {
    blockedUrls: ["old.example"],
    pausedSites: ["paused-here.example"],
    settings: oldSettings,
    blockedToday: { date: today(), count: 3 },
    blockedUrlLogs: [
      { timestamp: new Date().toISOString(), url: "https://old.example/ad.js" },
    ],
  };

  await upgrade(testInfo, { local, settingsAfter: oldSettings }, async (sw) => {
    expect(await sw.evaluate(() => chrome.storage.sync.get(null))).toEqual({
      blockedUrls: ["old.example"],
      pausedSites: ["paused-here.example"],
      settings: oldSettings,
    });
    // Moved keys are gone from local; the daily count and log stay there
    expect(await sw.evaluate(() => chrome.storage.local.get(null))).toEqual({
      blockedToday: local.blockedToday,
      blockedUrlLogs: local.blockedUrlLogs,
      syncLastGood: { blockedUrls: local.blockedUrls, pausedSites: local.pausedSites },
    });

    // Rules and switches rebuilt from the moved data
    expect(await ruleSummary(sw)).toEqual([
      ["block", "||old.example^"],
      ["allowAllRequests", ["paused-here.example"]],
    ]);
    expect(
      (
        await sw.evaluate(() =>
          chrome.declarativeNetRequest.getEnabledRulesets(),
        )
      ).sort(),
    ).toEqual(expectedRulesets(oldSettings));
    await setBadgeWindow(sw, true);
    await expect
      .poll(() => sw.evaluate(() => chrome.action.getBadgeText({})))
      .toBe("3");
  });
});

test("a real 1.8.1 install upgrades in place with history and rules, then survives a restart", async ({}, testInfo) => {
  const extensionDir = testInfo.outputPath("released-extension");
  const profileDir = testInfo.outputPath("released-profile");
  await mkdir(extensionDir, { recursive: true });
  const archive = execFileSync("git", ["archive", "v1.8.1"], { cwd: EXTENSION_DIR, maxBuffer: 20 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", extensionDir], { input: archive });
  const dateAgo = (n) => { const date = new Date(); date.setDate(date.getDate() - n); return date.toLocaleDateString("en-CA"); };
  const day = (count) => ({ types: { personal: count }, hosts: {}, pages: {} });
  const synced = { blockedUrls: ["keep.example"], pausedSites: ["pause.example"],
    hiddenElements: [{ site: "keep.example", selector: ".ad" }],
    siteSettings: { "custom.example": { autoplayGuard: false } },
    settings: { ...DEFAULT_SETTINGS, adRedirectGuard: true } };
  let id;
  {
    const installed = await launchExtension(profileDir, extensionDir);
    id = installed.id;
    try {
      // Command-line loading bypasses the UI toggle initially, but Reload
      // requires Developer mode, exactly like the documented unpacked route.
      const manager = await installed.context.newPage();
      await manager.goto("chrome://extensions");
      await manager.evaluate(() => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }));
      await manager.close();
      await waitForInstall(installed.sw);
      await installed.sw.evaluate(async ({ synced, dates }) => {
        await chrome.storage.sync.set(synced);
        await chrome.storage.local.set(dates);
      }, { synced, dates: { [`stats-${dateAgo(89)}`]: day(5), [`stats-${dateAgo(90)}`]: day(9),
        [`stats-${today()}`]: day(4), blockStats: { [today()]: day(2) }, blockedToday: { date: today(), count: 4 } } });
      await waitForInstall(installed.sw, synced.settings);
    } finally { await installed.context.close(); }
  }
  await copyExtension(extensionDir);
  // The same directory and profile preserve Chrome's extension ID and storage.
  for (let launch = 0; launch < 2; launch++) {
    const installed = await launchExtension(profileDir, extensionDir);
    const errors = watchErrors(installed.context);
    try {
      if (launch === 0) {
        // Match the Reload arrow used after updating an unpacked folder.
        const restarted = installed.context.waitForEvent("serviceworker", (worker) => worker !== installed.sw);
        const closed = new Promise((resolve) => installed.sw.once("close", resolve));
        await installed.sw.evaluate(() => { setTimeout(() => chrome.runtime.reload(), 0); });
        await closed;
        // A reloaded MV3 worker starts lazily when an extension page messages it.
        const wake = await installed.context.newPage();
        await wake.goto(`chrome-extension://${installed.id}/popup.html`);
        await wake.evaluate(() => chrome.runtime.sendMessage({ action: "getHistory" }));
        installed.sw = await restarted;
        await wake.close();
      }
      expect(installed.id).toBe(id);
      expect(await installed.sw.evaluate(() => chrome.runtime.getManifest().version)).toBe("1.9.0");
      await waitForInstall(installed.sw, synced.settings);
      const ext = makeHelpers(installed.context, installed.sw, installed.id);
      expect((await ext.sendMessage({ action: "getHistory" })).days).toEqual({ [dateAgo(89)]: day(5), [today()]: day(4) });
      expect(Object.keys(await ext.getLocal()).filter((key) => key.startsWith("stats-") || key === "blockStats")).toEqual([]);
      const raw = await ext.getSync();
      for (const key of ["pausedSites", "hiddenElements", "siteSettings"]) expect(raw[key]).toEqual(synced[key]);
      expect(raw.settings).toMatchObject(synced.settings);
      expect(await installed.sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts({ ids: ["ad-redirect-guard", "page-world-policy"] })).every((script) => script.allFrames))).toBe(true);
      if (launch === 0) {
        const result = await ext.sendMessage({ action: "mutate", operation: "importBackup", data: {
          blockedUrls: Array.from({ length: 500 }, (_, i) => `persisted-${i}.example`),
        } });
        expect(result.error).toBeUndefined();
      } else {
        expect(raw.blockedUrls.format).toBe("chunks-v1");
        expect((await ext.dynamicRules()).filter((rule) => rule.action.type === "block")).toHaveLength(501);
        expect((await ext.getLocal("syncLastGood")).syncLastGood.blockedUrls).toHaveLength(501);
      }
      expect(errors).toEqual([]);
    } finally { await installed.context.close(); }
  }
});

test("on a second computer, lists are merged and the synced switches win", async ({}, testInfo) => {
  const syncedSettings = { ...DEFAULT_SETTINGS, autoplayGuard: false };
  const local = {
    blockedUrls: ["shared.example", "old.example"],
    pausedSites: ["paused-here.example"],
    settings: { ...DEFAULT_SETTINGS, annoyanceRules: true },
  };
  const sync = {
    blockedUrls: ["synced.example", "shared.example"],
    pausedSites: ["from-sync.example"],
    settings: syncedSettings,
  };

  await upgrade(
    testInfo,
    { local, sync, settingsAfter: syncedSettings },
    async (sw) => {
      expect(await sw.evaluate(() => chrome.storage.sync.get(null))).toEqual({
        blockedUrls: ["synced.example", "shared.example", "old.example"],
        pausedSites: ["from-sync.example", "paused-here.example"],
        settings: syncedSettings,
      });
      expect(await sw.evaluate(() => chrome.storage.local.get(null))).toEqual({
        syncLastGood: {
          blockedUrls: ["synced.example", "shared.example", "old.example"],
          pausedSites: ["from-sync.example", "paused-here.example"],
        },
      });
      expect(await ruleSummary(sw)).toEqual([
        ["block", "||synced.example^"],
        ["block", "||shared.example^"],
        ["block", "||old.example^"],
        ["allowAllRequests", ["from-sync.example", "paused-here.example"]],
      ]);
      expect(
        (
          await sw.evaluate(() =>
            chrome.declarativeNetRequest.getEnabledRulesets(),
          )
        ).sort(),
      ).toEqual(["video_ads"]);
    },
  );
});
