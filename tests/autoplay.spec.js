import { test, expect } from "./helpers/extension.js";
import { FIRST, THIRD } from "./helpers/env.js";
import { quietEval } from "./helpers/quiet.js";

// Every read goes through quietEval: a Playwright evaluate() counts as a user
// gesture, and the stopper lets videos the user started play.

const videoState = (page) =>
  quietEval(page, () =>
    Object.fromEntries(
      Object.keys(window.plays).map((id) => [
        id,
        { playing: !document.getElementById(id).paused, tried: window.plays[id] > 0 },
      ])
    )
  );

const frameVideo = (frame) =>
  quietEval(frame, () => ({ playing: !document.getElementById("v").paused, tried: window.plays > 0 }));

test.describe("autoplay stopper", () => {
  test("pauses muted autoplay, also when the page retries play() later", async ({ ext, page }) => {
    await page.goto(`${FIRST}/autoplay.html`);
    await expect.poll(async () => (await videoState(page)).mutedAuto).toEqual({ playing: false, tried: true });
    // The page calls play() again after a second, still without a click
    await expect.poll(() => quietEval(page, () => window.plays.mutedAuto), { timeout: 5000 }).toBeGreaterThanOrEqual(2);
    expect((await videoState(page)).mutedAuto.playing).toBe(false);
  });

  test("lets videos the user starts play, muted or not", async ({ ext, page }) => {
    await page.goto(`${FIRST}/autoplay.html`);
    await page.click("#playMuted");
    await page.click("#playSound");
    await expect.poll(() => videoState(page)).toMatchObject({
      userMuted: { playing: true, tried: true },
      userSound: { playing: true, tried: true },
    });
    // Still playing a moment later: nothing paused them afterwards
    await page.waitForTimeout(500);
    expect(await videoState(page)).toMatchObject({
      userMuted: { playing: true },
      userSound: { playing: true },
    });
  });

  test("a key press elsewhere doesn't count as starting a video", async ({ ext, page }) => {
    await page.goto(`${FIRST}/autoplay.html`);
    // Reading with PageDown gives the page user activation, and a player that
    // autoplays as it scrolls into view calls play() a moment later
    await page.keyboard.press("PageDown");
    await quietEval(page, () => document.getElementById("userMuted").play().catch(() => {}));
    await expect.poll(async () => (await videoState(page)).userMuted).toEqual({ playing: false, tried: true });
  });

  test("a key press on the player still starts its muted video", async ({ ext, page }) => {
    await page.goto(`${FIRST}/autoplay.html`);
    await page.focus("#player");
    await page.keyboard.press("Space");
    await expect.poll(async () => (await videoState(page)).keyMuted).toEqual({ playing: true, tried: true });
    await page.waitForTimeout(500);
    expect((await videoState(page)).keyMuted.playing).toBe(true);
  });

  test("pauses muted autoplay in a cross-site iframe", async ({ ext, page }) => {
    await page.goto(`${FIRST}/autoplay.html`);
    const frame = page.frame({ url: `${THIRD}/autoplay-frame.html` });
    await expect.poll(() => frameVideo(frame)).toEqual({ playing: false, tried: true });
  });

  test("unloads a player that restarts itself and collapses its cross-site frame", async ({ ext, page }) => {
    await page.goto(`${FIRST}/restarter.html`);
    const frame = page.frame({ name: "restarter" });
    const frameHidden = () =>
      quietEval(page, () => getComputedStyle(document.querySelector('iframe[name="restarter"]')).display === "none");

    await expect.poll(frameHidden, { timeout: 5000 }).toBe(true);
    const unloaded = await quietEval(frame, () => {
      const v = document.getElementById("v");
      return {
        src: v.getAttribute("src"),
        networkState: v.networkState, // 0 is NETWORK_EMPTY
        readyState: v.readyState,
        playing: !v.paused,
        plays: window.plays,
      };
    });
    // No source left and nothing loaded (Chrome keeps currentSrc as it was)
    expect(unloaded).toMatchObject({ src: null, networkState: 0, readyState: 0, playing: false });
    // RESTART_LIMIT is 3: the fourth play unloads it
    expect(unloaded.plays).toBeGreaterThanOrEqual(4);
    expect(unloaded.plays).toBeLessThanOrEqual(5);

    // The loop is over, not just slowed down
    await page.waitForTimeout(1000);
    expect(await quietEval(frame, () => window.plays)).toBe(unloaded.plays);
    // Only the frame that asked is hidden
    expect(await page.$eval('iframe[name="plain"]', (f) => getComputedStyle(f).display)).not.toBe("none");
  });

  test("hides a small fixed corner player but not in-flow or full-window ones", async ({ ext, page }) => {
    await page.goto(`${FIRST}/floating.html`);
    await expect
      .poll(() => videoState(page))
      .toEqual({
        inlineVideo: { playing: false, tried: true },
        cornerVideo: { playing: false, tried: true },
        coverVideo: { playing: false, tried: true },
      });
    const display = (id) => quietEval(page, (i) => getComputedStyle(document.getElementById(i)).display, id);
    expect(await display("corner")).toBe("none");
    expect(await display("inline")).not.toBe("none");
    expect(await display("cover")).not.toBe("none");
  });

  test("switched off, it unregisters and autoplay plays", async ({ ext, page }) => {
    await ext.setSettings({ autoplayGuard: false });
    // The frame collapser stays for heavy ads
    expect(await ext.registeredScripts()).toEqual(["cosmetic", "frame-collapse", "heavy-ad-guard"]);

    await page.goto(`${FIRST}/autoplay.html`);
    await expect.poll(async () => (await videoState(page)).mutedAuto).toEqual({ playing: true, tried: true });
    const frame = page.frame({ url: `${THIRD}/autoplay-frame.html` });
    await expect.poll(() => frameVideo(frame)).toEqual({ playing: true, tried: true });

    await page.goto(`${FIRST}/floating.html`);
    await expect.poll(async () => (await videoState(page)).cornerVideo).toEqual({ playing: true, tried: true });
    expect(await page.$eval("#corner", (el) => getComputedStyle(el).display)).not.toBe("none");
  });

  test("with both frame features off, the collapser is unregistered too", async ({ ext }) => {
    await ext.setSettings({ autoplayGuard: false, heavyAds: false });
    expect(await ext.registeredScripts()).toEqual(["cosmetic"]);
    await ext.setSettings({});
    expect(await ext.registeredScripts()).toEqual(["autoplay-guard", "cosmetic", "frame-collapse", "heavy-ad-guard"]);
  });
});
