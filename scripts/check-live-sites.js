import { collectBannerEvidence } from "./live-evidence.js";
// Read-only, opt-in live smoke check. No sign-in, purchases or form submissions.
// Results are observations, not assertions that every ad/video path works.
import { chromium } from "@playwright/test";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
const targets = process.env.LIVE_TARGETS
  ? JSON.parse(process.env.LIVE_TARGETS)
  : [
      ["news", "https://www.pcworld.com/"],
      ["shopping", "https://www.bestbuy.com/"],
      ["sports", "https://www.espn.com/"],
      ["streaming", "https://vimeo.com/watch"],
      ["streaming-player", "https://player.vimeo.com/video/76979871"],
    ];
const repeats = Math.max(1, Math.min(5, Number(process.env.LIVE_REPEATS) || 1));
const output = resolve(process.argv[2] ?? "artifacts/live-sites");
await mkdir(output, { recursive: true });
const results = [];
for (let sample = 1; sample <= repeats; sample++) {
  for (const [category, url] of targets) {
    for (const enabled of [false, true]) {
      const profile = await mkdtemp(join(tmpdir(), "subtle-live-"));
      const label = `${category}-${enabled ? "protected" : "baseline"}-${sample}`;
      let context;
      const result = {
        category,
        sample,
        url,
        enabled,
        checkedAt: new Date().toISOString(),
      };
      try {
        const extension = resolve(".");
        context = await chromium.launchPersistentContext(profile, {
          headless: true,
          channel: "chromium",
          viewport: { width: 1365, height: 900 },
          args: enabled
            ? [
                `--disable-extensions-except=${extension}`,
                `--load-extension=${extension}`,
              ]
            : [],
        });
        let worker;
        if (enabled) {
          worker =
            context.serviceWorkers()[0] ??
            (await context.waitForEvent("serviceworker"));
          for (let i = 0; i < 100; i++) {
            if (
              await worker.evaluate(async () =>
                (await chrome.scripting.getRegisteredContentScripts()).some(
                  (s) => s.id === "cosmetic",
                ),
              )
            )
              break;
            await new Promise((r) => setTimeout(r, 100));
          }
        }
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const failed = [];
        page.on("requestfailed", (r) =>
          failed.push({ url: r.url(), error: r.failure()?.errorText }),
        );
        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        result.status = response?.status();
        await page.waitForTimeout(6000);
        // Scrolling is read-only and exercises deferred embeds.
        await page.mouse.wheel(0, 650);
        await page.waitForTimeout(3000);
        const session = await context.newCDPSession(page);
        const snapshot = await session.send("Runtime.evaluate", {
          expression: `JSON.stringify({
        title:document.title, text:document.body.innerText.slice(0,500),
        visibleImages:[...document.images].filter(i=>i.naturalWidth>0&&i.getBoundingClientRect().height>0).length,
        adSlots:[...document.querySelectorAll('[data-ad-slot],iframe[id^="google_ads_iframe"],ins.adsbygoogle')].map(e=>({tag:e.tagName,visible:e.getBoundingClientRect().height>0})),
        videos:[...document.querySelectorAll('video')].map(v=>({paused:v.paused,muted:v.muted,readyState:v.readyState,hasSource:!!v.currentSrc})),
        restoredPlaceholders:document.querySelectorAll('subtle-removed-content').length
      })`,
          returnByValue: true,
          userGesture: false,
        });
        result.observed = JSON.parse(snapshot.result.value);
        result.bannerEvidence = await collectBannerEvidence(page);
        result.bannerCheck = result.bannerEvidence.length
          ? "Decoded visible creative images observed in marked ad regions; compare screenshots and paired samples. Canvas/video creatives are not measured."
          : result.observed.adSlots.length
            ? "Ad slots observed; visibility alone does not prove a creative rendered."
            : "Inconclusive: no recognized banner slot in this sample.";
        result.userVideoCheck =
          "Inconclusive: no suitable playable video in the top document.";
        if (result.observed.videos.length) {
          const playButton = page
            .getByRole("button", { name: "Play", exact: true })
            .first();
          if (await playButton.isVisible()) {
            await playButton.click();
            try {
              await page.waitForFunction(
                () =>
                  [...document.querySelectorAll("video")].some(
                    (v) => !v.paused && v.currentTime > 1,
                  ),
                {},
                { timeout: 15000 },
              );
            } catch {}
            const state = await session.send("Runtime.evaluate", {
              expression: `JSON.stringify([...document.querySelectorAll('video')].map(v=>({paused:v.paused,time:v.currentTime,readyState:v.readyState,error:v.error?.code})))`,
              returnByValue: true,
              userGesture: false,
            });
            result.userVideoCheck = `Clicked the player's Play button: ${state.result.value}`;
          } else
            result.userVideoCheck =
              "Inconclusive: video exists but no visible Play button was available.";
        }
        result.failedRequests = failed.length;
        result.blockedRequests = failed.filter((r) =>
          r.error?.includes("BLOCKED_BY_CLIENT"),
        ).length;
        if (worker)
          result.extensionLog = await worker.evaluate(async () =>
            (
              (await chrome.storage.local.get("blockedUrlLogs"))
                .blockedUrlLogs ?? []
            ).map((l) => l.url),
          );
        await page.screenshot({
          path: join(output, `${label}.png`),
          timeout: 15000,
        });
      } catch (error) {
        result.error = error.message;
      } finally {
        await context?.close();
        await rm(profile, { recursive: true, force: true });
      }
      results.push(result);
      await writeFile(
        join(output, "results.json"),
        JSON.stringify(results, null, 2),
      );
      console.log(JSON.stringify(result));
    }
  }
}
