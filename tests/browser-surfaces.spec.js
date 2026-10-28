import { test, expect } from "./helpers/extension.js";
import { FIRST } from "./helpers/env.js";

async function attachTarget(session, targetId) {
  const { sessionId } = await session.send("Target.attachToTarget", {
    targetId,
    flatten: false,
  });
  let id = 0;
  return async (method, params = {}) => {
    const callId = ++id;
    const response = new Promise((resolve, reject) => {
      const listener = (event) => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message);
        if (message.id !== callId) return;
        session.off("Target.receivedMessageFromTarget", listener);
        message.error
          ? reject(new Error(message.error.message))
          : resolve(message.result);
      };
      session.on("Target.receivedMessageFromTarget", listener);
    });
    await session.send("Target.sendMessageToTarget", {
      sessionId,
      message: JSON.stringify({ id: callId, method, params }),
    });
    return response;
  };
}

test("actual toolbar popup shows site controls and saves an autoplay exception", async ({
  ext,
  page,
  context,
}, testInfo) => {
  await page.goto(`${FIRST}/pause.html`);
  await page.bringToFront();
  await ext.sw.evaluate(() => chrome.action.openPopup());
  const session = await context.newCDPSession(page);
  let target;
  await expect
    .poll(async () => {
      target = (await session.send("Target.getTargets")).targetInfos.find(
        (t) => t.url === ext.url("popup.html"),
      );
      return Boolean(target);
    })
    .toBe(true);
  const send = await attachTarget(session, target.targetId);
  const evaluate = async (expression) =>
    (
      await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result.value;
  await expect
    .poll(() =>
      evaluate('document.querySelector("#siteControls summary")?.textContent'),
    )
    .toBe("Controls for 127.0.0.1");
  await evaluate('document.querySelector("#siteControls").open=true');
  await evaluate(
    '(()=>{const s=document.querySelector(\'[aria-label="Muted autoplay videos on this site"]\');s.value="false";s.dispatchEvent(new Event("change",{bubbles:true}));})()',
  );
  await expect
    .poll(() => ext.getSync("siteSettings"))
    .toEqual({ siteSettings: { "127.0.0.1": { autoplayGuard: false } } });
  await expect
    .poll(() =>
      evaluate(
        'document.querySelector("#siteControls [role=status]").textContent',
      ),
    )
    .toBe("Saved. Tab reloaded.");
  const shot = await send("Page.captureScreenshot");
  await testInfo.attach("actual-toolbar", {
    body: Buffer.from(shot.data, "base64"),
    contentType: "image/png",
  });
});

// Exercise a real DevTools extension panel, rather than a normal tab that
// happens to load panel.html. The inspectedWindow API must point at the site.
import { launchExtension, waitForInstall } from "./helpers/extension.js";
import { EXTENSION_DIR } from "./helpers/env.js";
test("actual DevTools panel controls the inspected site", async ({}, testInfo) => {
  const { context, sw, id } = await launchExtension(
    testInfo.outputPath("devtools-profile"),
    EXTENSION_DIR,
    {
      args: [
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
        "--auto-open-devtools-for-tabs",
      ],
    },
  );
  try {
    await waitForInstall(sw);
    for (const initial of context.pages()) await initial.close();
    const page = await context.newPage();
    await page.goto(`${FIRST}/pause.html`);
    const session = await context.newCDPSession(page);
    let target;
    await expect
      .poll(async () => {
        target = (await session.send("Target.getTargets")).targetInfos.find(
          (t) => t.url.startsWith("devtools://") && t.type === "page",
        );
        return Boolean(target);
      })
      .toBe(true);
    const frontend = await attachTarget(session, target.targetId);
    const evaluate = async (send, expression) =>
      (
        await send("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        })
      ).result.value;
    // Select the registered panel through Chromium's own frontend. Its tab
    // may be inside the overflow menu in a narrow docked DevTools window.
    await expect
      .poll(() =>
        evaluate(
          frontend,
          `(async()=>{const UI=await import('./ui/legacy/legacy.js');const view=UI.InspectorView.InspectorView.instance();const id=view.tabbedPane.tabIds().find(id=>id.startsWith('chrome-extension://'));if(!id)return false;await view.showPanel(id);return true;})()`,
        ),
      )
      .toBe(true);
    let panelTarget;
    await expect
      .poll(async () => {
        panelTarget = (
          await session.send("Target.getTargets")
        ).targetInfos.find(
          (t) => t.url === `chrome-extension://${id}/panel.html`,
        );
        return Boolean(panelTarget);
      })
      .toBe(true);
    const panel = await attachTarget(session, panelTarget.targetId);
    await expect
      .poll(() =>
        evaluate(
          panel,
          'document.querySelector("#siteControls summary")?.textContent',
        ),
      )
      .toBe("Controls for 127.0.0.1");
    await evaluate(
      panel,
      `(()=>{document.querySelector('#siteControls').open=true;const s=document.querySelector('[aria-label="Muted autoplay videos on this site"]');s.value='false';s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await expect
      .poll(() =>
        sw.evaluate(
          async () =>
            (await chrome.storage.sync.get("siteSettings")).siteSettings,
        ),
      )
      .toEqual({ "127.0.0.1": { autoplayGuard: false } });
    await testInfo.attach("actual-devtools", {
      body: Buffer.from(
        (await frontend("Page.captureScreenshot")).data,
        "base64",
      ),
      contentType: "image/png",
    });
  } finally {
    await context.close();
  }
});

test("actual toolbar shows an inherited pause and resumes it with On", async ({
  ext,
  page,
  context,
}) => {
  await ext.setSync({ pausedSites: ["example.com"] });
  await page.route("https://news.example.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Inherited pause</title><p>Article</p>",
    }),
  );
  await page.goto("https://news.example.com/");
  await page.bringToFront();
  await ext.sw.evaluate(() => chrome.action.openPopup());
  const session = await context.newCDPSession(page);
  let target;
  await expect
    .poll(async () => {
      target = (await session.send("Target.getTargets")).targetInfos.find(
        (t) => t.url === ext.url("popup.html"),
      );
      return !!target;
    })
    .toBe(true);
  const send = await attachTarget(session, target.targetId);
  const evaluate = async (expression) =>
    (
      await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result.value;
  await expect
    .poll(() => evaluate('document.querySelector("#powerDesc").textContent'))
    .toContain("Paused by example.com");
  expect(
    await evaluate('document.querySelector("input[value=site]").checked'),
  ).toBe(true);
  await evaluate('document.querySelector("input[value=on]").click()');
  await expect
    .poll(async () => (await ext.getSync("pausedSites")).pausedSites)
    .toEqual([]);
  await expect
    .poll(() => evaluate('document.querySelector("#powerDesc").textContent'))
    .toContain("Blocking on news.example.com");
});
