// Unloads a third-party ad frame that keeps the CPU busy, the kind of ad that
// spins up the laptop fan. background.js registers this in every frame while
// the heavy ads setting is on, and checks download size itself. The script
// stops right away in the page itself and in frames from the same site.
(async () => {
  await subtlePolicy.ready;
  if (window.top === window) return;

  // Chrome's own heavy ad rule allows 15s of CPU per 30s. That's well past
  // fan territory, so this is a third of it.
  const CPU_LIMIT_MS = 5000; // Total long-task time...
  const CPU_WINDOW_MS = 30000; // ...inside this window

  const siteOf = (origin) => new URL(origin).hostname.replace(/^www\./, "");
  let frameSite = "";
  let topSite = "";
  try {
    frameSite = siteOf(self.origin); // about:blank frames inherit their parent's
    topSite = siteOf(
      location.ancestorOrigins[location.ancestorOrigins.length - 1],
    );
  } catch {
    // Sandboxed ad frames have an opaque origin: treat them as third-party
  }
  const sameSite =
    frameSite &&
    (frameSite === topSite ||
      frameSite.endsWith(`.${topSite}`) ||
      topSite.endsWith(`.${frameSite}`));
  if (sameSite) return;

  const recentTasks = [];
  const observer = new PerformanceObserver((list) => {
    for (const task of list.getEntries()) {
      recentTasks.push({
        end: task.startTime + task.duration,
        duration: task.duration,
      });
    }
    const now = performance.now();
    while (recentTasks.length > 0 && now - recentTasks[0].end > CPU_WINDOW_MS) {
      recentTasks.shift();
    }

    const busyMs = recentTasks.reduce((sum, task) => sum + task.duration, 0);
    // A frame the user clicked (a video they started) is never unloaded
    if (
      busyMs < CPU_LIMIT_MS ||
      !subtlePolicy.enabled("heavyAds") ||
      navigator.userActivation.hasBeenActive
    ) {
      return;
    }

    observer.disconnect();
    parent.postMessage(
      {
        type: "subtle:heavy",
        url: location.href,
        reason: `${(busyMs / 1000).toFixed(1)}s of CPU`,
      },
      "*",
    );
  });
  observer.observe({ type: "longtask", buffered: true });
})();
