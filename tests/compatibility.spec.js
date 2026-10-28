import { test, expect } from "./helpers/extension.js";
import { FIRST, THIRD } from "./helpers/env.js";
import { collectBannerEvidence } from "../scripts/live-evidence.js";
import { quietEval } from "./helpers/quiet.js";

test("ordinary creative pixels and intentional video survive default and optional protections", async ({
  ext,
  page,
}) => {
  for (const settings of [
    {},
    {
      annoyanceRules: true,
      notificationRules: true,
      adChurnRules: true,
      refreshThrottle: true,
      adRedirectGuard: true,
    },
  ]) {
    await ext.setSettings(settings);
    await page.goto(`${FIRST}/compatibility.html`);
    await expect
      .poll(async () => (await collectBannerEvidence(page)).length)
      .toBe(1);
    const [creative] = await collectBannerEvidence(page);
    expect(creative).toMatchObject({ width: 320, height: 50 });
    await page.click("#play");
    await expect
      .poll(() =>
        quietEval(
          page,
          () =>
            !document.querySelector("video").paused &&
            document.querySelector("video").currentTime > 0.3,
        ),
      )
      .toBe(true);
  }
});

test("site exceptions converge after redirects and simultaneous tab navigations", async ({
  ext,
  context,
}) => {
  await ext.setSync({
    siteSettings: {
      localhost: { videoAdRules: false },
      "127.0.0.1": { videoAdRules: true },
    },
  });
  const pages = await Promise.all(
    Array.from({ length: 8 }, () => context.newPage()),
  );
  await Promise.all(
    pages.map((page, i) =>
      page.goto(
        i % 2 ? `${FIRST}/compatibility.html` : `${FIRST}/redirect-to-third`,
      ),
    ),
  );
  async function activeTabIds() {
    return ext.sw.evaluate(
      async (url) =>
        (await chrome.tabs.query({}))
          .filter((t) => t.url === url)
          .map((t) => t.id)
          .sort((a, b) => a - b),
      `${THIRD}/compatibility.html`,
    );
  }
  async function allowedTabIds() {
    return ext.sw.evaluate(async () =>
      [
        ...new Set(
          (await chrome.declarativeNetRequest.getSessionRules())
            .filter((r) => r.action.type === "allow")
            .flatMap((r) => r.condition.tabIds),
        ),
      ].sort((a, b) => a - b),
    );
  }
  await expect.poll(allowedTabIds).toEqual(await activeTabIds());
  await Promise.all(
    pages.map((page, i) =>
      page.goto(
        i % 2 ? `${THIRD}/compatibility.html` : `${FIRST}/compatibility.html`,
      ),
    ),
  );
  await expect.poll(allowedTabIds).toEqual(await activeTabIds());
  await Promise.all(pages.map((page) => page.close()));
  await expect.poll(allowedTabIds).toEqual([]);
});
