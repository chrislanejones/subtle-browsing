import { readFile } from "node:fs/promises";
import { test, expect } from "./helpers/extension.js";
import { TORRENT_SITES } from "../torrent-sites.js";

const rules = JSON.parse(await readFile(new URL("../rules/torrent-ads.json", import.meta.url)));
const html = `<!doctype html><title>Torrent popup fixture</title>
  <p id="plain">Directory content</p>
  <form action="/search" id="search"><input aria-label="Search" name="q"><button id="submit">Search</button></form>
  <output id="searchResult"></output>
  <a id="login" href="https://partner.example/login" target="_blank">Sign in</a>
  <script>
    document.querySelector('form').onsubmit = e => { e.preventDefault(); document.querySelector('output').textContent = 'Search submitted'; };
    // Reproduces Torlock/TorrentFunk's document-capture popunder handler.
    document.addEventListener('click', e => {
      if (e.target.closest('#login')) return;
      window.open('/z6r4p.php?c=p1', '_blank', 'noopener,noreferrer');
    }, true);
  </script>`;

async function serve(context) {
  await context.route(/^https?:\/\//, (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "frame.example")
      return route.fulfill({ contentType: "text/html", body: '<p id="frameText">Frame content</p><script>document.onclick=()=>window.open("https://popup.example/")</script>' });
    if (url.pathname === "/loader.css")
      return route.fulfill({ contentType: "text/javascript", body: "window.popunderLoaded = true" });
    if (url.hostname === "code.jquery.com")
      return route.fulfill({ contentType: "text/javascript", body: "window.libraryLoaded = true" });
    if (url.hostname === "acceptable.a-ads.com")
      return route.fulfill({ contentType: "text/html", body: "<p>Ordinary banner</p>" });
    return route.fulfill({ contentType: "text/html", body: html });
  });
}

async function blockedClick(page, locator) {
  const stopped = page.waitForEvent("console", (m) => m.text().startsWith("Subtle stopped a popup"));
  const count = page.context().pages().length;
  await locator.click();
  await stopped;
  expect(page.context().pages()).toHaveLength(count);
}

test("default protection stops search-focus and search-submit popunders on an audited site", async ({ ext, page, context }) => {
  await serve(context);
  await page.goto("https://www.torlock.com/");
  await blockedClick(page, page.getByRole("textbox", { name: "Search", exact: true }));
  await blockedClick(page, page.locator("#submit"));
  await expect(page.locator("#searchResult")).toHaveText("Search submitted");
  await blockedClick(page, page.locator("#plain"));
  // Choosing an actual external link still opens the requested page.
  const opened = context.waitForEvent("page");
  await page.locator("#login").click();
  const partner = await opened;
  await partner.waitForLoadState();
  expect(partner.url()).toBe("https://partner.example/login");
});

test("torrent-site policy protects an unrelated third-party iframe too", async ({ ext, page, context }) => {
  await serve(context);
  await page.goto("https://www.torrentfunk.com/");
  await page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.src = "https://frame.example/";
    document.body.append(frame);
  });
  await blockedClick(page, page.frameLocator("iframe").locator("#frameText"));
});

test("off, parent-site pause, and global pause restore the site's popup behavior", async ({ ext, page, context }) => {
  await serve(context);
  await page.goto("https://www.torlock.com/");
  await blockedClick(page, page.locator("#plain"));
  for (const state of [
    { settings: { torrentAds: false } },
    { settings: {}, pausedSites: ["torlock.com"] },
    { pausedSites: [], pausedEverywhere: true },
  ]) {
    await ext.setSync(state);
    await page.reload();
    const opened = context.waitForEvent("page");
    await page.locator("#plain").click();
    const popup = await opened;
    await popup.close();
  }
  await ext.setSync({ pausedEverywhere: false });
  await page.reload();
  await blockedClick(page, page.locator("#plain"));
});

test("ordinary sites and suffix lookalikes do not gain torrent-site interception", async ({ ext, page, context }) => {
  await serve(context);
  for (const host of ["example.org", "torlock.com.example.org", "nottorlock.com"]) {
    await page.goto(`https://${host}/`);
    const opened = context.waitForEvent("page");
    await page.locator("#plain").click();
    await (await opened).close();
  }
});

test("identified loader scripts are blocked, including scripts disguised as CSS; ordinary assets remain", async ({ ext, page, context }) => {
  await serve(context);
  await page.goto("https://bitsearch.eu/");
  const failed = page.waitForEvent("requestfailed", (r) => r.url() === "https://www.displayvertising.com/loader.css");
  await page.evaluate(() => {
    for (const src of ["https://www.displayvertising.com/loader.css", "https://code.jquery.com/library.js"]) {
      const script = document.createElement("script"); script.src = src; document.head.append(script);
    }
    const banner = document.createElement("iframe");
    banner.src = "https://acceptable.a-ads.com/2437400/";
    document.body.append(banner);
  });
  expect((await failed).failure().errorText).toContain("BLOCKED_BY_CLIENT");
  expect(await page.evaluate(() => window.popunderLoaded)).toBeUndefined();
  await expect.poll(() => page.evaluate(() => window.libraryLoaded)).toBe(true);
  await expect(page.frameLocator("iframe").getByText("Ordinary banner")).toBeVisible();
});

test("all listed hosts match loader rules; unrelated sites, shared CDN assets and banners do not", async ({ ext }) => {
  const result = await ext.sw.evaluate(async ({ hosts, domains }) => {
    const matches = async (url, initiator, type = "script") =>
      (await chrome.declarativeNetRequest.testMatchOutcome({ url, initiator, type }))
        .matchedRules.some((r) => r.rulesetId === "torrent_ads");
    return {
      hosts: await Promise.all(hosts.map((host) => matches("https://www.cdn4ads.com/loader.css", `https://${host}`))),
      domains: await Promise.all(domains.map((host) => matches(`https://${host}/loader.js`, "https://filemood.com"))),
      ordinary: await matches("https://www.cdn4ads.com/loader.css", "https://example.org"),
      lookalike: await matches("https://www.cdn4ads.com/loader.css", "https://torlock.com.example.org"),
      cdn: await matches("https://other-project.cloudfront.net/library.js", "https://bitsearch.eu"),
      banner: await matches("https://www.cdn4ads.com/banner.png", "https://bitsearch.eu", "image"),
    };
  }, { hosts: TORRENT_SITES, domains: rules[0].condition.requestDomains });
  expect(result.hosts).toEqual(TORRENT_SITES.map(() => true));
  expect(result.domains).toEqual(rules[0].condition.requestDomains.map(() => true));
  expect(result).toMatchObject({ ordinary: false, lookalike: false, cdn: false, banner: false });
});

test("full settings owns the default-on switch and switching off removes network rules", async ({ ext, page }) => {
  await page.goto(ext.url("options.html"));
  await expect(page.locator("#torrentAdsToggle")).toBeChecked();
  await page.locator("#torrentAdsToggle").uncheck();
  await expect.poll(() => ext.enabledRulesets()).not.toContain("torrent_ads");
  await page.reload();
  await expect(page.locator("#torrentAdsToggle")).not.toBeChecked();
  for (const path of ["popup.html", "panel.html"]) {
    await page.goto(ext.url(path));
    await expect(page.locator("#torrentAdsToggle")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /intrusive torrent-site ads/ })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: /intrusive torrent-site ads/ })).toHaveCount(0);
  }
});
