import { readFile } from "node:fs/promises";
import { test, expect } from "./helpers/extension.js";

const fixture = await readFile(new URL("./site/age-gate.html", import.meta.url), "utf8");

// Serve only our non-explicit fixture. These tests never contact adult sites.
async function openGate(page, host = "chaturbate.com", html = fixture) {
  await page.route(/^https?:\/\//, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto(`https://${host}/`);
}

const overflow = (page) => page.evaluate(() =>
  [document.documentElement, document.body].map((node) => getComputedStyle(node).overflow),
);

test("the supplied gate, wrapper and both backdrops are hidden by default; content is usable", async ({ ext, page }) => {
  await openGate(page);
  for (const selector of ["#age_gate_home", "#overlay", ".modal-backdrop"])
    for (const element of await page.locator(selector).all()) await expect(element).toBeHidden();
  await expect.poll(() => overflow(page)).toEqual(["auto", "auto"]);
  await page.click("#content");
  await expect(page.locator("#clicks")).toHaveText("1");
  await page.mouse.wheel(0, 700);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(page.url()).toBe("https://chaturbate.com/");
  expect(await page.context().cookies()).toEqual([]);
  expect(await page.locator("#choice-verifymy-email").isChecked()).toBe(false);
});

for (const [host, markup] of [
  ["www.pornhub.com", '<div id="js-ageDisclaimerMain">Age confirmation</div>'],
  ["pornhub.org", '<div id="ageDisclaimer">Age confirmation</div>'],
  ["www.xvideos.com", '<div class="modal-adult">Age confirmation</div>'],
  ["www.xnxx.com", '<div id="disclaimer">Age confirmation</div>'],
  ["xhamster.com", '<div data-role="age-verification-modal">Age confirmation</div>'],
  ["stripchat.com", '<div data-testid="age-verification-modal">Age confirmation</div>'],
  ["youporn.com", '<div id="age-verification-wrapper">Age confirmation</div>'],
  ["redtube.com", '<div id="ageDisclaimer">Age confirmation</div>'],
]) {
  test(`supported overlay pattern on ${host}`, async ({ ext, page }) => {
    const html = `<!doctype html><html><body style="overflow: hidden"><main><button>Page content</button></main><div role="dialog">${markup}</div></body></html>`;
    await openGate(page, host, html);
    await expect(page.getByRole("dialog", { includeHidden: true })).toBeHidden();
    await page.getByRole("button", { name: "Page content" }).click();
    await expect.poll(() => overflow(page)).toEqual(["auto", "auto"]);
  });
}

test("late and replaced gates are hidden, while unrelated dialogs are preserved", async ({ ext, page }) => {
  await openGate(page, "en.chaturbate.com");
  await expect(page.locator("#overlay")).toBeHidden();
  await page.evaluate(() => {
    document.getElementById("overlay").remove();
    document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
    document.getElementById("unrelated").hidden = false;
  });
  await expect(page.locator("#unrelated")).toBeVisible();
  await expect.poll(() => overflow(page)).toEqual(["hidden", "hidden"]);
  await page.evaluate(() => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = '<div data-testid="age-gate">Verify your age</div>';
    document.body.append(overlay);
  });
  await expect(page.locator(".modal-overlay")).toBeHidden();
  await expect(page.locator("#unrelated")).toBeVisible();
  await expect.poll(() => overflow(page)).toEqual(["auto", "auto"]);
});

test("turning off, site overrides and every pause restore the original gate and scrolling", async ({ ext, page }) => {
  await openGate(page, "en.chaturbate.com");
  await expect(page.locator("#overlay")).toBeHidden();
  const restore = async () => {
    await expect(page.locator("#overlay")).toBeVisible();
    await expect(page.locator("#age_gate_home")).toBeVisible();
    await expect(page.locator("#backdrop-before")).toBeVisible();
    await expect.poll(() => overflow(page)).toEqual(["hidden", "hidden"]);
  };
  await ext.setSettings({ adultAgeGates: false });
  await restore();
  await page.reload();
  await restore();
  await ext.setSettings({}); // Older installs with no saved key inherit on.
  await expect(page.locator("#overlay")).toBeHidden();
  for (const state of [
    { siteSettings: { "chaturbate.com": { adultAgeGates: false } } },
    { pausedSites: ["chaturbate.com"] },
    { pausedEverywhere: true },
  ]) {
    await ext.setSync(state);
    await restore();
    await ext.setSync({ siteSettings: {}, pausedSites: [], pausedEverywhere: false });
    await expect(page.locator("#overlay")).toBeHidden();
  }
  await ext.setLocal({ temporaryPauses: { "chaturbate.com": Date.now() + 60_000 } });
  await restore();
  await ext.setLocal({ temporaryPauses: {} });
  await expect(page.locator("#overlay")).toBeHidden();
});

test("ordinary sites and lookalike domains keep age and other dialogs unchanged", async ({ ext, page }) => {
  for (const host of ["example.org", "chaturbate.com.example.org", "notchaturbate.com"]) {
    await openGate(page, host);
    await expect(page.locator("#age_gate_home")).toBeVisible();
    await expect.poll(() => overflow(page)).toEqual(["hidden", "hidden"]);
  }
});

test("a server-only gate does not create content or submit verification", async ({ ext, page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await openGate(page, "chaturbate.com", '<!doctype html><div id="age_gate_home"><a href="/verify">Confirm Age</a></div>');
  await expect(page.locator("#age_gate_home")).toBeHidden();
  expect(await page.locator("main, video, iframe").count()).toBe(0);
  expect(requests).toEqual(["https://chaturbate.com/"]);
});

test("a native age dialog does not leave the loaded page inert", async ({ ext, page }) => {
  await openGate(page, "chaturbate.com", `<!doctype html><main><button id="content">Page content</button></main>
    <dialog><div id="age_gate_home">Verify your age</div></dialog>
    <script>document.querySelector('dialog').showModal()</script>`);
  await expect(page.locator("#age_gate_home")).toBeHidden();
  await page.locator("#content").click({ timeout: 3000 });
  await ext.setSettings({ adultAgeGates: false });
  await expect(page.locator("dialog")).toBeVisible();
  expect(await page.locator("dialog").evaluate((node) => node.matches(":modal"))).toBe(true);
  await ext.setSettings({});
  await page.locator("#content").click();
});

test("the switch appears only in full settings, persists off, and updates an open page", async ({ ext, page, context }) => {
  await openGate(page);
  await expect(page.locator("#overlay")).toBeHidden();
  const settings = await context.newPage();
  await settings.goto(ext.url("options.html"));
  await expect(settings.locator("#adultAgeGatesToggle")).toBeChecked();
  await settings.locator("#adultAgeGatesToggle").uncheck();
  await expect.poll(async () => (await ext.getSync("settings")).settings?.adultAgeGates).toBe(false);
  await expect(page.locator("#overlay")).toBeVisible();
  await settings.reload();
  await expect(settings.locator("#adultAgeGatesToggle")).not.toBeChecked();
  await settings.locator("#adultAgeGatesToggle").check();
  await expect(page.locator("#overlay")).toBeHidden();

  for (const path of ["popup.html", "panel.html"]) {
    await page.bringToFront();
    await settings.goto(ext.url(path));
    await expect(settings.locator("#adultAgeGatesToggle")).toHaveCount(0);
    await expect(settings.getByRole("checkbox", { name: /Block age gates/ })).toHaveCount(0);
    await expect(settings.getByRole("combobox", { name: /Block age gates/ })).toHaveCount(0);
  }
});

test("full settings reports Incognito access and links to this extension's details", async ({ ext, page, context }) => {
  await page.goto(ext.url("options.html"));
  await expect(page.locator("#incognitoStatus")).toHaveText("Not allowed in Incognito yet");
  const opened = context.waitForEvent("page");
  await page.locator("#incognitoButton").click();
  const details = await opened;
  await details.waitForLoadState();
  expect(details.url()).toBe(`chrome://extensions/?id=${ext.id}`);
});

test("enabling Incognito access lets the blocker run in an Incognito window", async ({ ext, page, context }) => {
  await page.goto("chrome://extensions");
  await page.evaluate(async (id) => {
    await chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true });
    await chrome.developerPrivate.updateExtensionConfiguration({ extensionId: id, incognitoAccess: true });
  }, ext.id);
  // Chrome reloads the extension asynchronously after this permission changes.
  await expect.poll(() => page.evaluate(async (id) => {
    try { return (await chrome.developerPrivate.getExtensionInfo(id)).state; }
    catch { return "RELOADING"; }
  }, ext.id)).toBe("ENABLED");
  await page.goto(ext.url("options.html"));
  await expect(page.locator("#incognitoStatus")).toHaveText("Allowed in Incognito");
  const incognito = await context.browser().newContext();
  try {
    const tab = await incognito.newPage();
    await openGate(tab);
    await expect(tab.locator("#age_gate_home")).toBeHidden();
    await tab.locator("#content").click();
    await expect(tab.locator("#clicks")).toHaveText("1");
  } finally {
    await incognito.close();
  }
});
