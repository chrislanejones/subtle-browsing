// A visible ad container alone is not evidence of a rendered creative.
// Record decoded, visible images within publisher-marked ad regions, including
// cross-origin frames. Canvas/video creatives still need manual inspection.
export async function collectBannerEvidence(page) {
  const evidence = [];
  for (const frame of page.frames()) {
    let markedFrame = false;
    let visible = true;
    for (let child = frame; child.parentFrame(); child = child.parentFrame()) {
      try {
        const element = await child.frameElement();
        visible &&= await element.isVisible();
        markedFrame ||= await element.evaluate((el) =>
          Boolean(
            el.closest(
              '[data-ad-slot],[data-ad-unit],ins.adsbygoogle,iframe[id^="google_ads_iframe"]',
            ),
          ),
        );
      } catch {
        visible = false;
      }
    }
    if (!visible) continue;
    try {
      const images = await frame.evaluate(
        (marked) =>
          [...document.images]
            .filter((image) => {
              const box = image.getBoundingClientRect();
              const style = getComputedStyle(image);
              return (
                image.complete &&
                image.naturalWidth >= 80 &&
                image.naturalHeight >= 30 &&
                box.width >= 80 &&
                box.height >= 30 &&
                style.visibility !== "hidden" &&
                style.display !== "none" &&
                Number(style.opacity) > 0 &&
                (marked ||
                  image.closest(
                    "[data-ad-slot],[data-ad-unit],ins.adsbygoogle",
                  ))
              );
            })
            .map((image) => ({
              src: image.currentSrc,
              width: image.naturalWidth,
              height: image.naturalHeight,
            })),
        markedFrame,
      );
      evidence.push(
        ...images.map((image) => ({ frame: frame.url(), ...image })),
      );
    } catch {
      /* A rotating ad frame may detach while being inspected. */
    }
  }
  return evidence;
}
