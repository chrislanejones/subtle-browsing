// Renders the Web Store promo tiles (440x280 small, 1400x560 marquee) and the
// GitHub social preview (1280x640) from the Quiet shield icon.
// Run `node scripts/generate-promo-tiles.js`.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const icon = readFileSync("docs/store/branding/shield/icon256.png").toString("base64");
const browser = await chromium.launch({ channel: "chromium" });
// Deep teal field with soft light, a darker rounded card holding the mark on
// the same white tile as the toolbar icon
const tile = (w, h, iconSize, font, padX, padY) => `<!doctype html><html><body style="margin:0">
<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(60% 80% at 22% 30%, #2a8fa3 0%, transparent 60%),
             radial-gradient(50% 70% at 85% 85%, #1d7d91 0%, transparent 65%),
             linear-gradient(135deg, #0c4e5e 0%, #08313d 100%);">
  <div style="display:flex;align-items:center;gap:${Math.round(iconSize * 0.12)}px;padding:${padY}px ${padX}px;
    border-radius:${Math.round(h * 0.06)}px;background:rgba(5,22,28,.72);box-shadow:0 0 0 1px rgba(255,255,255,.06)">
    <div style="width:${iconSize}px;height:${iconSize}px;display:grid;place-items:center;
      border-radius:${Math.round(iconSize * 0.19)}px;background:#fff">
      <img src="data:image/png;base64,${icon}" style="width:${Math.round(iconSize * 0.77)}px;height:${Math.round(iconSize * 0.77)}px">
    </div>
    <span style="font:600 ${font}px/1 'Helvetica Neue',Arial,sans-serif;color:#f4f7f8;letter-spacing:-0.01em">URL Blocker</span>
  </div></div></body></html>`;
for (const [name, w, h, iconSize, font, padX, padY] of [
  ["promo-small-440x280", 440, 280, 64, 34, 30, 24],
  ["promo-marquee-1400x560", 1400, 560, 150, 84, 72, 54],
  // GitHub's repo social preview (Settings → Social preview), 1280x640
  ["github-social-1280x640", 1280, 640, 160, 90, 76, 58],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(tile(w, h, iconSize, font, padX, padY));
  await page.screenshot({ path: `docs/store/${name}.png` });
}
await browser.close();
