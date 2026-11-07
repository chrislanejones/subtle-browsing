import { collectBannerEvidence } from "./live-evidence.js";
import { DEFAULTS } from "../settings.js";
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
const overrides = JSON.parse(process.env.LIVE_SETTINGS ?? "{}");
if (!overrides || Array.isArray(overrides) || typeof overrides !== "object" ||
    Object.entries(overrides).some(([key, value]) => !Object.hasOwn(DEFAULTS, key) || typeof value !== "boolean"))
  throw new Error("LIVE_SETTINGS must be an object of known boolean protection settings.");
const settings = { ...DEFAULTS, ...overrides };
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
          if (Object.keys(overrides).length)
            await worker.evaluate(settings => chrome.storage.sync.set({ settings }), settings);
          const expectedRules = Object.entries({ video_ads: settings.videoAdRules,
            annoyances: settings.annoyanceRules, notifications: settings.notificationRules,
            ad_churn: settings.adChurnRules, torrent_ads: settings.torrentAds,
          }).filter(([, on]) => on).map(([id]) => id).sort();
          const expectedScripts = ["cosmetic",
            settings.autoplayGuard && "autoplay-guard", settings.heavyAds && "heavy-ad-guard",
            (settings.autoplayGuard || settings.heavyAds) && "frame-collapse",
            settings.refreshThrottle && "refresh-throttle",
            (settings.adRedirectGuard || settings.torrentAds) && "ad-redirect-guard",
            (settings.refreshThrottle || settings.adRedirectGuard || settings.torrentAds) && "page-world-policy",
          ].filter(Boolean).sort();
          let ready = false;
          for (let i = 0; i < 100; i++) {
            ready = await worker.evaluate(async ({ rules, scripts }) =>
              JSON.stringify((await chrome.declarativeNetRequest.getEnabledRulesets()).sort()) === JSON.stringify(rules) &&
              JSON.stringify((await chrome.scripting.getRegisteredContentScripts()).map(s => s.id).sort()) === JSON.stringify(scripts),
            { rules: expectedRules, scripts: expectedScripts });
            if (ready) break;
            await new Promise(r => setTimeout(r, 100));
          }
          if (!ready) throw new Error("Extension protections did not finish applying.");
          result.settings = settings;
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
        const newsLayout = await session.send("Runtime.evaluate", {
          expression: `JSON.stringify({
            url:location.origin+location.pathname,
            headline:document.querySelector('h1')?.innerText?.slice(0,180),
            articleCharacters:document.querySelector('article')?.innerText?.length ?? 0,
            accessRestricted:/access denied|access restricted|just a moment|verify you are human|403 forbidden|security challenge/i.test(document.title+' '+document.body.innerText.slice(0,300)),
            slots:[...document.querySelectorAll('[id^="MileTech_"].fixedAd,aside:has(> div:only-child > .adWrapper:only-child > [id^="MileTech_"].fixedAd),.universal-ad__ad,.universal-ad__close-button,.sticky-bottom:has(.ad-sticky-container),.st-adunit-ad')].map(e=>{
              const s=getComputedStyle(e),r=e.getBoundingClientRect();
              return {id:e.id,classes:String(e.className),position:s.position,top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)};
            })
          })`, returnByValue: true, userGesture: false,
        });
        result.newsLayout = JSON.parse(newsLayout.result.value);
        result.bannerEvidence = await collectBannerEvidence(page);
        result.bannerCheck = result.bannerEvidence.length
          ? "Decoded visible creative images observed in marked ad regions; compare screenshots and paired samples. Canvas/video creatives are not measured."
          : result.observed.adSlots.length
            ? "Ad slots observed; visibility alone does not prove a creative rendered."
            : "Inconclusive: no recognized banner slot in this sample.";
        result.userVideoCheck =
          "Inconclusive: no suitable playable video in the top document.";
        if (result.observed.videos.length) {
          let clicked = false;
          // Some players cover their inner Play control with a second "Play
          // video" button. Consent overlays can cover both. Do not force clicks
          // through those, and still preserve the other observations on failure.
          for (const name of ["Play video", "Play"]) {
            for (const button of await page.getByRole("button", { name, exact: true }).all()) {
              if (!await button.isVisible()) continue;
              try { await button.click({ timeout: 2000 }); clicked = true; break; }
              catch { /* Obscured or detached; try the next visible control. */ }
            }
            if (clicked) break;
          }
          if (clicked) {
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
              "Inconclusive: no accessible Play control; it may be absent or obscured by an overlay.";
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
