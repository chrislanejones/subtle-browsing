// Rebuild the listing's 1280×800 screenshots from the current extension UI.
// A fresh profile contains illustrative rules only; no personal browser data.
import { launchExtension, waitForInstall } from "../tests/helpers/extension.js";

const { context, sw, id } = await launchExtension("");
try {
  await waitForInstall(sw);
  await sw.evaluate(() => chrome.storage.sync.set({
    blockedUrls: ["taboola.com", "outbrain.com", "https://news.example.com/sponsored", "revcontent.com", "mgid.com"],
    pausedSites: ["bank.example.com"],
  }));
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.locator("#manageSummary").filter({ hasText: "5 blocked URLs" }).waitFor();
  await page.fill("#urlInput", "ads.example.com");
  await page.evaluate(() => {
    document.querySelector("#blockedToday").style.display = "none";
    document.querySelector("#powerRow").open = true;
    const popup = document.createElement("section");
    popup.style.cssText = "width:360px;flex:none;display:flex;flex-direction:column;gap:10px;padding:14px;background:var(--color-bg);border-radius:12px;box-shadow:0 12px 40px #17212b25";
    popup.append(...document.body.childNodes);
    const caption = document.createElement("section");
    caption.style.cssText = "width:440px;color:#202c34";
    const title = document.createElement("h2");
    title.style.cssText = "font:700 40px/1.15 Arial;margin:0 0 20px";
    title.textContent = "Stop the ads people hate. Keep the banners.";
    const description = document.createElement("p");
    description.style.cssText = "font:20px/1.45 Arial;color:#4c5966;margin:0";
    description.textContent = "Stop unwanted video and click hijacks. Block a URL, pick an ad on the page, or turn blocking off for one site.";
    const note = document.createElement("p");
    note.style.cssText = "font:13px Arial;color:#4c5966;margin-top:24px";
    note.textContent = "Example settings shown. Stop ad redirects is optional.";
    caption.append(title, description, note);
    document.body.style.cssText = "width:1280px;max-width:none;height:800px;margin:0;padding:0;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:72px;background:#edf2f6";
    document.body.append(caption, popup);
  });
  await page.screenshot({ path: "docs/store/screenshot-1-popup.png" });
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.locator("#urlList .url-item").first().waitFor();
  // Focus on the settings controls; unpacked-only network charts are omitted.
  await page.evaluate(() => {
    document.querySelector(".top").style.display = "none";
    document.querySelector("#activity").style.display = "none";
    document.body.style.cssText = "max-width:none;margin:0;padding:16px 32px";
  });
  await page.screenshot({ path: "docs/store/screenshot-2-settings.png" });
  console.log("Updated both store screenshots (1280×800).");
} finally {
  await context.close();
}
