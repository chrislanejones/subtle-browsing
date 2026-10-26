import { test, expect } from "./helpers/extension.js";
import { FIRST, THIRD } from "./helpers/env.js";
import { quietEval } from "./helpers/quiet.js";

// Closed shadow roots are inspected through DevTools, just as Chrome does.
async function clickShadowButton(page, label) {
  const session = await page.context().newCDPSession(page);
  const { root } = await session.send("DOM.getDocument", {
    depth: -1,
    pierce: true,
  });
  const text = (n) =>
    n.nodeType === 3 ? n.nodeValue : (n.children ?? []).map(text).join("");
  function find(n) {
    if (n.nodeName === "BUTTON" && text(n) === label) return n;
    for (const child of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) {
      const found = find(child);
      if (found) return found;
    }
  }
  const node = find(root);
  expect(node, label).toBeTruthy();
  const { object } = await session.send("DOM.resolveNode", {
    backendNodeId: node.backendNodeId,
  });
  await session.send("Runtime.callFunctionOn", {
    objectId: object.objectId,
    functionDeclaration: "function(){this.click()}",
    userGesture: true,
  });
  await session.detach();
}

test("heavy removal spares a legitimate embed, preserves banners and restores the ad once", async ({
  ext,
  page,
}) => {
  await page.goto(`${FIRST}/selective.html`);
  await expect
    .poll(() => page.frame({ name: "advert" })?.url())
    .toBe("about:blank");
  const legit = page.frame({ name: "legitimate" });
  await expect
    .poll(() =>
      quietEval(legit, () => document.getElementById("got").textContent),
    )
    .toBe("5242880");
  expect(
    await quietEval(page, () => document.getElementById("banner").naturalWidth),
  ).toBeGreaterThan(0);
  await clickShadowButton(page, "Restore this content");
  await expect
    .poll(() =>
      quietEval(
        page.frame({ name: "advert" }),
        () => document.getElementById("got")?.textContent,
      ),
    )
    .toBe("5242880");
  await page.waitForTimeout(1000);
  expect(page.frame({ name: "advert" }).url()).toBe(`${THIRD}/heavy-net.html`);
  await expect(page.locator('iframe[name="advert"]')).toBeVisible();
});

test("broader mode stops an unmarked heavy embed only on the chosen site", async ({
  ext,
  page,
}) => {
  await ext.setSync({
    siteSettings: { "127.0.0.1": { aggressiveHeavyAds: true } },
  });
  await page.goto(`${FIRST}/selective.html`);
  await expect
    .poll(() => page.frame({ name: "legitimate" })?.url())
    .toBe("about:blank");
});

test("site autoplay exception keeps personal URL blocks active", async ({
  ext,
  page,
}) => {
  await ext.setBlockedUrls(["localhost"]);
  await page.goto(`${FIRST}/pause.html`);
  const tabId = await ext.tabIdOf(page);
  expect(
    await ext.sendMessage({
      action: "setSiteSetting",
      site: "127.0.0.1",
      key: "autoplayGuard",
      value: false,
      tabId,
    }),
  ).toEqual({ ok: true });
  await page.waitForLoadState();
  await expect
    .poll(() =>
      quietEval(page, () => ({
        playing: !document.getElementById("mutedAuto").paused,
        banner: document.getElementById("adimg").naturalWidth,
      })),
    )
    .toEqual({ playing: true, banner: 0 });
});

test("category exceptions apply to nested third-party requests but personal rules still win", async ({
  ext,
  page,
}) => {
  await page.goto(`${FIRST}/index.html`);
  const tabId = await ext.tabIdOf(page);
  expect(
    await ext.sendMessage({
      action: "setSiteSetting",
      site: "127.0.0.1",
      key: "videoAdRules",
      value: false,
      tabId,
    }),
  ).toEqual({ ok: true });
  const result = () =>
    ext.sw.evaluate(
      async (tabId) =>
        chrome.declarativeNetRequest.testMatchOutcome({
          url: "https://connatix.com/player.js",
          type: "script",
          initiator: "https://third-party.example",
          tabId,
        }),
      tabId,
    );
  await expect
    .poll(async () =>
      (await result()).matchedRules.some((r) => r.rulesetId === "_session"),
    )
    .toBe(true);
  await ext.setBlockedUrls(["connatix.com"]);
  await expect
    .poll(async () =>
      (await result()).matchedRules.some((r) => r.rulesetId === "_dynamic"),
    )
    .toBe(true);
  const other = await ext.sw.evaluate(() =>
    chrome.declarativeNetRequest.testMatchOutcome({
      url: "https://connatix.com/player.js",
      type: "script",
      tabId: -1,
    }),
  );
  expect(other.matchedRules.some((r) => r.rulesetId === "_session")).toBe(
    false,
  );
});

test("newsletter and notification switches are independent, including legacy migration", async ({
  ext,
  page,
}) => {
  await ext.setSettings({ annoyanceRules: true });
  expect(await ext.enabledRulesets()).toEqual([
    "annoyances",
    "notifications",
    "video_ads",
  ]);
  await page.goto(ext.url("options.html"));
  await page.locator("#notificationRulesToggle").uncheck();
  await expect
    .poll(() => ext.enabledRulesets())
    .toEqual(["annoyances", "video_ads"]);
  await page.locator("#annoyanceRulesToggle").uncheck();
  await page.locator("#notificationRulesToggle").check();
  await expect
    .poll(() => ext.enabledRulesets())
    .toEqual(["notifications", "video_ads"]);
});

test("picker hides a URL-less element only here, persists and can be undone in DevTools", async ({
  ext,
  page,
  context,
}) => {
  await page.goto(`${FIRST}/selective.html`);
  await ext.sendMessage({
    action: "startSelector",
    tabId: await ext.tabIdOf(page),
  });
  const box = await page.locator("#offer").boundingBox();
  await page.mouse.click(box.x + 10, box.y + 5);
  await clickShadowButton(page, "Hide on this site");
  await expect(page.locator("#offer")).toBeHidden();
  await page.reload();
  await expect(page.locator("#offer")).toBeHidden();
  const other = await context.newPage();
  await other.goto(`${THIRD}/selective.html`);
  await expect(other.locator("#offer")).toBeVisible();
  const panel = await context.newPage();
  await panel.goto(ext.url("panel.html"));
  await panel
    .getByText("Hidden elements and site overrides", { exact: true })
    .click();
  await panel.getByRole("button", { name: "Unhide", exact: true }).click();
  await expect(page.locator("#offer")).toBeVisible();
  expect(await ext.getSync("blockedUrls")).toEqual({});
});

test("new rules round-trip in backups and malformed selectors are discarded", async ({
  ext,
  page,
}) => {
  await page.goto(ext.url("options.html"));
  await page.setInputFiles("#importFile", {
    name: "new.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        siteSettings: {
          "news.example": { autoplayGuard: false, unknown: true },
        },
        hiddenElements: [
          { site: "news.example", selector: "#offer" },
          { site: "news.example", selector: "body{color:red}" },
        ],
      }),
    ),
  });
  await expect
    .poll(() => ext.getSync("hiddenElements"))
    .toEqual({
      hiddenElements: [{ site: "news.example", selector: "#offer" }],
    });
  expect(await ext.getSync("siteSettings")).toEqual({
    siteSettings: { "news.example": { autoplayGuard: false } },
  });
  const downloadPromise = page.waitForEvent("download");
  await page.click("#exportButton");
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.hiddenElements).toEqual([
    { site: "news.example", selector: "#offer" },
  ]);
  expect(backup.siteSettings).toEqual({
    "news.example": { autoplayGuard: false },
  });
});

test("site overrides can enable guards that are off globally", async ({
  ext,
  page,
}) => {
  await ext.setSettings({
    autoplayGuard: false,
    heavyAds: false,
    videoAdRules: false,
  });
  await page.goto(`${FIRST}/pause.html`);
  const tabId = await ext.tabIdOf(page);
  const enable = async (key) => {
    const loaded = page.waitForEvent("load");
    const response = await ext.sendMessage({
      action: "setSiteSetting",
      site: "127.0.0.1",
      key,
      value: true,
      tabId,
    });
    expect(response).toEqual({ ok: true });
    await loaded;
  };
  await enable("autoplayGuard");
  await expect
    .poll(() =>
      quietEval(page, () => ({
        paused: document.getElementById("mutedAuto").paused,
        tried: window.plays > 0,
      })),
    )
    .toEqual({ paused: true, tried: true });
  await enable("heavyAds");
  await page.goto(`${FIRST}/selective.html`);
  await expect
    .poll(() => page.frame({ name: "advert" })?.url())
    .toBe("about:blank");
  expect(page.frame({ name: "legitimate" }).url()).not.toBe("about:blank");
  await enable("videoAdRules");
  const result = await ext.sw.evaluate(
    (tabId) =>
      chrome.declarativeNetRequest.testMatchOutcome({
        url: "https://connatix.com/player.js",
        type: "script",
        tabId,
      }),
    tabId,
  );
  expect(result.matchedRules.some((r) => r.rulesetId === "_session")).toBe(
    true,
  );
});

test("full pause disables saved hiding and unpause restores it", async ({
  ext,
  page,
}) => {
  await ext.setSync({
    hiddenElements: [{ site: "127.0.0.1", selector: "#offer" }],
  });
  await page.goto(`${FIRST}/selective.html`);
  await expect(page.locator("#offer")).toBeHidden();
  const tabId = await ext.tabIdOf(page);
  expect(
    await ext.sendMessage({
      action: "pauseSite",
      site: "127.0.0.1",
      paused: true,
      tabId,
    }),
  ).toEqual({ ok: true });
  await expect(page.locator("#offer")).toBeVisible();
  expect(
    await ext.sendMessage({
      action: "pauseSite",
      site: "127.0.0.1",
      paused: false,
      tabId,
    }),
  ).toEqual({ ok: true });
  await expect(page.locator("#offer")).toBeHidden();
});
