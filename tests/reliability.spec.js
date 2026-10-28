import {
  test,
  expect,
  launchExtension,
  waitForInstall,
} from "./helpers/extension.js";
import { FIRST, THIRD } from "./helpers/env.js";
import { quietEval } from "./helpers/quiet.js";

const match = (ext, url) =>
  ext.sw.evaluate(
    (url) =>
      chrome.declarativeNetRequest.testMatchOutcome({ url, type: "script" }),
    url,
  );

test("simultaneous edits from two extension windows preserve both rules and settings", async ({
  ext,
  context,
}) => {
  const pages = await Promise.all([context.newPage(), context.newPage()]);
  await Promise.all(pages.map((page) => page.goto(ext.url("popup.html"))));
  const results = await Promise.all(
    pages.map((page, i) =>
      page.evaluate(async (i) => {
        const { addBlockedUrl } = await import("./blocklist.js");
        const { updateSettings } = await import("./settings.js");
        await updateSettings(
          i ? { notificationRules: true } : { annoyanceRules: true },
        );
        return addBlockedUrl(i ? "beta.example" : "alpha.example");
      }, i),
    ),
  );
  expect(results).toEqual([true, true]);
  expect((await ext.getSync("blockedUrls")).blockedUrls.sort()).toEqual([
    "alpha.example",
    "beta.example",
  ]);
  expect((await ext.getSync("settings")).settings).toMatchObject({
    notificationRules: true,
    annoyanceRules: true,
  });
});

test("exact URL mode isolates host, scheme, path case and query; IDNA and patterns work", async ({
  ext,
  page,
}) => {
  await page.goto(ext.url("popup.html"));
  await page.selectOption("#ruleMode", "exact");
  await page.fill("#urlInput", "https://example.com/Ad.js?x=1");
  await expect(page.locator("#rulePreview")).toContainText(
    "Scheme, host, path and query must match",
  );
  await page.click("#addButton");
  await expect(page.locator("#statusMessage")).toContainText(
    "Blocked https://example.com/Ad.js?x=1",
  );
  expect(
    (await match(ext, "https://example.com/Ad.js?x=1")).matchedRules,
  ).toHaveLength(1);
  for (const url of [
    "https://notexample.com/Ad.js?x=1",
    "http://example.com/Ad.js?x=1",
    "https://example.com/ad.js?x=1",
    "https://example.com/Ad.js?x=12",
    "https://other.example/?ref=example.com/Ad.js?x=1",
  ])
    expect((await match(ext, url)).matchedRules, url).toHaveLength(0);
  await page.selectOption("#ruleMode", "domain");
  await page.fill("#urlInput", "bücher.example");
  await page.click("#addButton");
  await expect(page.locator("#statusMessage")).toContainText(
    "xn--bcher-kva.example",
  );
  expect(
    (await match(ext, "https://xn--bcher-kva.example/a.js")).matchedRules,
  ).toHaveLength(1);
  await page.selectOption("#ruleMode", "pattern");
  await page.fill("#urlInput", "||pattern.example^*/ads/*");
  await page.click("#addButton");
  await expect(page.locator("#statusMessage")).toContainText(
    "Blocked Pattern:",
  );
  expect(
    (await match(ext, "https://pattern.example/path/ads/a.js")).matchedRules,
  ).toHaveLength(1);
});

test("legacy URL paths no longer match look-alike hosts or query strings", async ({
  ext,
}) => {
  await ext.setBlockedUrls(["example.com/ad.js"]);
  expect(
    (await match(ext, "https://example.com/ad.js")).matchedRules,
  ).toHaveLength(1);
  expect(
    (await match(ext, "http://example.com/ad.js")).matchedRules,
  ).toHaveLength(1);
  expect(
    (await match(ext, "https://notexample.com/ad.js")).matchedRules,
  ).toHaveLength(0);
  expect(
    (await match(ext, "https://other.example/?ref=example.com/ad.js"))
      .matchedRules,
  ).toHaveLength(0);
});

test("blocking has immediate undo and invalid input never saves a rule", async ({
  ext,
  page,
}) => {
  await page.goto(ext.url("options.html"));
  await page.fill("#urlInput", "one.example");
  await page.click("#addButton");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect((await ext.getSync("blockedUrls")).blockedUrls).toEqual([]);
  await page.fill("#urlInput", "bad host");
  await page.click("#addButton");
  await expect(page.locator("#blockedStatus")).toContainText("spaces");
  expect((await ext.getSync("blockedUrls")).blockedUrls).toEqual([]);
});

test("inherited pauses are identified and On resumes the parent pause", async ({
  ext,
  page,
}) => {
  await ext.setSync({ pausedSites: ["example.com"] });
  await page.goto(ext.url("popup.html"));
  const before = await page.evaluate(async () =>
    (await import("./settings.js")).getPauseState("news.example.com"),
  );
  expect(before).toMatchObject({ mode: "site", inheritedFrom: "example.com" });
  const response = await ext.sendMessage({
    action: "setPower",
    mode: "on",
    site: "news.example.com",
  });
  expect(response).toEqual({ ok: true });
  expect((await ext.getSync("pausedSites")).pausedSites).toEqual([]);
});

test("power failures retain confirmed state and expose an error", async ({
  ext,
  page,
}) => {
  await page.goto(ext.url("popup.html"));
  await page.evaluate(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = (message) =>
      message.action === "setPower"
        ? Promise.resolve({ error: "Could not save test change" })
        : original(message);
  });
  await page.locator("#powerRow > summary").click();
  await page.locator('label:has(input[value="everywhere"])').click();
  await expect(page.locator('input[value="on"]')).toBeChecked();
  await expect(page.locator("#powerStatus")).toContainText(
    "Could not save test change",
  );
  expect((await ext.getSync("pausedEverywhere")).pausedEverywhere).not.toBe(
    true,
  );
});

test("temporary pauses expire without reloading a page or losing typed input", async ({
  ext,
  page,
}) => {
  await ext.setBlockedUrls(["localhost"]);
  await page.goto(`${FIRST}/pause.html`);
  const tabId = await ext.tabIdOf(page);
  const reloaded = page.waitForEvent("load");
  expect(
    await ext.sendMessage({
      action: "setPower",
      mode: "temporary",
      site: "127.0.0.1",
      tabId,
    }),
  ).toEqual({ ok: true });
  await reloaded;
  await page.evaluate(() => {
    const input = document.createElement("input");
    input.id = "draft";
    input.value = "keep my work";
    document.body.append(input);
  });
  expect(
    (await ext.getLocal("temporaryPauses")).temporaryPauses["127.0.0.1"] -
      Date.now(),
  ).toBeGreaterThan(590000);
  await ext.setLocal({ temporaryPauses: { "127.0.0.1": Date.now() - 1000 } });
  await ext.sw.evaluate(() =>
    chrome.alarms.create("temporary-pauses", { when: Date.now() + 50 }),
  );
  await expect
    .poll(async () => (await ext.getLocal("temporaryPauses")).temporaryPauses)
    .toEqual({});
  await expect(page.locator("#draft")).toHaveValue("keep my work");
  await expect
    .poll(
      async () =>
        (await ext.dynamicRules()).filter(
          (r) => r.action.type === "allowAllRequests",
        ).length,
    )
    .toBe(0);
});

test("settings leads with activity, resumes blocking, and retains reset feedback", async ({
  ext,
  page,
}) => {
  await ext.setSync({
    pausedEverywhere: true,
    siteSettings: { "example.com": { autoplayGuard: false } },
  });
  await page.goto(ext.url("options.html"));
  // Activity leads, always open; switches and the list sit below it
  await expect(page.locator("#activity")).toBeVisible();
  const activity = await page.locator("#activity").boundingBox();
  const grid = await page.locator(".settings-grid").boundingBox();
  expect(activity.y).toBeLessThan(grid.y);
  await page
    .getByRole("button", { name: "Resume blocking", exact: true })
    .click();
  await expect(page.locator("#powerState")).toHaveText("Blocking is on");
  await page
    .getByRole("button", { name: "Reset site example.com", exact: true })
    .click();
  await expect(page.locator("#savedRules [role=status]")).toContainText(
    "Reload the site",
  );
});

test("store-style diagnostics distinguish unavailable network data from zero", async ({
  ext,
  page,
}) => {
  await page.addInitScript(() => {
    chrome.declarativeNetRequest.onRuleMatchedDebug = undefined;
  });
  await page.goto(ext.url("options.html"));
  await expect(page.locator("#tiles .tile-value").first()).toHaveText(
    "Unavailable",
  );
  await expect(page.locator("#perDay")).toContainText("unavailable");
  await expect(page.locator("#countNote")).toBeVisible();
});

// Closed shadow controls are inspected through CDP, as in picker tests.
async function clickShadowButton(page, host, text) {
  const session = await page.context().newCDPSession(page);
  const expression = `document.querySelector(${JSON.stringify(host)})`;
  const { result } = await session.send("Runtime.evaluate", { expression });
  const { node } = await session.send("DOM.describeNode", {
    objectId: result.objectId,
    depth: -1,
    pierce: true,
  });
  const find = (n) =>
    n.nodeName === "BUTTON" &&
    (n.children ?? []).some((c) => c.nodeValue === text)
      ? n
      : [...(n.children ?? []), ...(n.shadowRoots ?? [])]
          .map(find)
          .find(Boolean);
  const button = find(node);
  if (!button) throw new Error(`Missing ${text}`);
  const { object } = await session.send("DOM.resolveNode", {
    backendNodeId: button.backendNodeId,
  });
  await session.send("Runtime.callFunctionOn", {
    objectId: object.objectId,
    functionDeclaration: "function(){this.click()}",
    userGesture: true,
  });
  await session.detach();
}

test("autoplay restart removal offers restore and lets the video play", async ({
  ext,
  page,
}) => {
  await page.goto(`${FIRST}/restarter.html`);
  await expect(page.locator("subtle-removed-content")).toHaveCount(1);
  await clickShadowButton(
    page,
    "subtle-removed-content",
    "Restore this content",
  );
  const frame = page.frame({ name: "restarter" });
  await expect
    .poll(() =>
      quietEval(
        frame,
        () =>
          !document.querySelector("video").paused &&
          !!document.querySelector("video").getAttribute("src"),
      ),
    )
    .toBe(true);
  await expect(page.locator('iframe[name="restarter"]')).toBeVisible();
  await expect(page.locator("subtle-removed-content")).toHaveCount(0);
});

test("floating video recovery stays in the viewport on a long article", async ({
  ext,
  page,
}) => {
  await page.route(`${FIRST}/long-article.html`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><div style="height:2000px">Long article</div><div id="corner" style="position:fixed;right:16px;bottom:16px;width:200px;height:100px"><video muted autoplay loop src="${FIRST}/clip.webm"></video></div>`,
    }),
  );
  await page.goto(`${FIRST}/long-article.html`);
  const placeholder = page.locator("subtle-paused-video");
  await expect(placeholder).toBeVisible();
  const box = await placeholder.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
  await clickShadowButton(page, "subtle-paused-video", "Play this video");
  await expect(page.locator("#corner")).toBeVisible();
  await expect
    .poll(() => quietEval(page, () => !document.querySelector("video").paused))
    .toBe(true);
});

test("simultaneous import and rule addition preserve both edits", async ({
  ext,
  page,
}) => {
  await page.goto(ext.url("options.html"));
  await page.evaluate(async () => {
    const { mutate } = await import("./storage-client.js");
    await Promise.all([
      mutate("importBackup", {
        blockedUrls: ["imported.example"],
        pausedSites: [],
        settings: {},
      }),
      mutate("blockUrl", { url: "added.example", mode: "domain" }),
    ]);
  });
  expect((await ext.getSync("blockedUrls")).blockedUrls.sort()).toEqual([
    "added.example",
    "imported.example",
  ]);
});

test("picker hiding has immediate undo without opening settings", async ({
  ext,
  page,
}) => {
  await page.goto(`${FIRST}/picker.html`);
  const tabId = await ext.tabIdOf(page);
  await ext.sendMessage({ action: "startSelector", tabId });
  await page.bringToFront();
  // A URL-less element guarantees the site-only hide path.
  const box = await page.locator("#plain").boundingBox();
  await page.mouse.click(box.x + 5, box.y + 5);
  await clickShadowButton(page, "url-blocker-ui", "Hide on this site");
  await expect(page.locator("#plain")).toBeHidden();
  await clickShadowButton(page, "url-blocker-ui", "Undo");
  await expect(page.locator("#plain")).toBeVisible();
  expect((await ext.getSync("hiddenElements")).hiddenElements).toEqual([]);
});

test("temporary pauses survive browser restart and expired pauses clear on startup", async ({}, testInfo) => {
  const profile = testInfo.outputPath("timed-pause-profile");
  let launched = await launchExtension(profile);
  try {
    await waitForInstall(launched.sw);
    const ui = await launched.context.newPage();
    await ui.goto(`chrome-extension://${launched.id}/popup.html`);
    expect(
      await ui.evaluate(() =>
        chrome.runtime.sendMessage({
          action: "setPower",
          mode: "temporary",
          site: "example.com",
        }),
      ),
    ).toEqual({ ok: true });
  } finally {
    await launched.context.close();
  }
  launched = await launchExtension(profile);
  try {
    await expect
      .poll(() =>
        launched.sw.evaluate(
          async () =>
            (await chrome.alarms.get("temporary-pauses"))?.scheduledTime ?? 0,
        ),
      )
      .toBeGreaterThan(Date.now());
    expect(
      await launched.sw.evaluate(async () =>
        (await chrome.declarativeNetRequest.getDynamicRules()).some((r) =>
          r.condition.requestDomains?.includes("example.com"),
        ),
      ),
    ).toBe(true);
    await launched.sw.evaluate(() =>
      chrome.storage.local.set({
        temporaryPauses: { "example.com": Date.now() - 1000 },
      }),
    );
  } finally {
    await launched.context.close();
  }
  launched = await launchExtension(profile);
  try {
    await expect
      .poll(() =>
        launched.sw.evaluate(
          async () =>
            (await chrome.storage.local.get("temporaryPauses")).temporaryPauses,
        ),
      )
      .toEqual({});
    await expect
      .poll(() =>
        launched.sw.evaluate(
          async () =>
            (await chrome.declarativeNetRequest.getDynamicRules()).length,
        ),
      )
      .toBe(0);
  } finally {
    await launched.context.close();
  }
});

test("backups preserve exact, advanced and legacy URL rule semantics", async ({
  ext,
  page,
}) => {
  await page.goto(ext.url("options.html"));
  await page.setInputFiles("#importFile", {
    name: "rules.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        blockedUrls: [
          "url:https://exact.example/a.js?x=1",
          "pattern:||pattern.example^*/ads/*",
          "legacy.example/path.js",
        ],
      }),
    ),
  });
  await expect(page.locator("#backupStatus")).toContainText("Imported 3 URLs");
  for (const url of [
    "https://exact.example/a.js?x=1",
    "https://pattern.example/path/ads/a.js",
    "http://legacy.example/path.js",
    "https://legacy.example/path.js",
  ])
    expect((await match(ext, url)).matchedRules, url).toHaveLength(1);
  for (const url of [
    "http://exact.example/a.js?x=1",
    "https://notlegacy.example/path.js",
    "https://legacy.example/path.js?extra=1",
  ])
    expect((await match(ext, url)).matchedRules, url).toHaveLength(0);
});
