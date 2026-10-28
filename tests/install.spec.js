import { test, expect } from "./helpers/extension.js";

test.describe("fresh install", () => {
  test("turns on the video ad list and leaves the annoyances list off", async ({ ext }) => {
    expect(await ext.enabledRulesets()).toEqual(["video_ads"]);
  });

  test("registers the frame scripts", async ({ ext }) => {
    const scripts = await ext.sw.evaluate(() => chrome.scripting.getRegisteredContentScripts());
    expect(scripts.map((s) => s.id).sort()).toEqual([
      "autoplay-guard",
      "cosmetic",
      "frame-collapse",
      "heavy-ad-guard",
    ]);
    // Ad frames are often about:blank or nested, so every frame is covered
    for (const script of scripts) {
      expect(script).toMatchObject({
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: "document_start",
        matches: ["<all_urls>"],
      });
    }
  });

  test("adds the 'Block ad element' context menu item", async ({ ext }) => {
    // There's no API to list menu items, but updating a missing one rejects
    const update = (id) =>
      ext.sw.evaluate(
        (menuId) =>
          chrome.contextMenus.update(menuId, {}).then(
            () => "ok",
            (error) => error.message
          ),
        id
      );
    expect(await update("block-ad-element")).toBe("ok");
    expect(await update("not-a-menu-item")).not.toBe("ok");
  });

  test("suggests Alt+Shift+K for the picker", async ({ ext }) => {
    const commands = await ext.sw.evaluate(() => chrome.commands.getAll());
    expect(commands.find((c) => c.name === "start-picker")).toMatchObject({
      shortcut: "Alt+Shift+K",
      description: "Select an ad to block",
    });
  });

  test("suggests Alt+Shift+O for turning a site off and on", async ({ ext }) => {
    const commands = await ext.sw.evaluate(() => chrome.commands.getAll());
    expect(commands.find((c) => c.name === "toggle-site")).toMatchObject({
      shortcut: "Alt+Shift+O",
      description: "Turn blocking off or on for this site",
    });
  });

  test("schedules the badge reset for just after local midnight", async ({ ext }) => {
    const alarm = await ext.sw.evaluate(async () => {
      const found = await chrome.alarms.get("midnight");
      if (!found) return null;
      const at = new Date(found.scheduledTime);
      return {
        local: [at.getHours(), at.getMinutes(), at.getSeconds()],
        msFromNow: found.scheduledTime - Date.now(),
      };
    });
    expect(alarm).not.toBeNull();
    expect(alarm.local).toEqual([0, 0, 1]);
    expect(alarm.msFromNow).toBeGreaterThan(0);
    expect(alarm.msFromNow).toBeLessThanOrEqual(25 * 60 * 60 * 1000); // DST days run 25 hours
  });

  test("schedules the next badge change for 7 past or the top of the hour", async ({ ext }) => {
    const alarm = await ext.sw.evaluate(async () => {
      const found = await chrome.alarms.get("badge-window");
      if (!found) return null;
      const at = new Date(found.scheduledTime);
      return { local: [at.getMinutes(), at.getSeconds()], msFromNow: found.scheduledTime - Date.now() };
    });
    expect(alarm).not.toBeNull();
    expect([[7, 0], [0, 1]]).toContainEqual(alarm.local);
    expect(alarm.msFromNow).toBeGreaterThan(0);
    expect(alarm.msFromNow).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  test("uses its own badge color and starts with an empty badge", async ({ ext }) => {
    expect(await ext.sw.evaluate(() => chrome.action.getBadgeBackgroundColor({}))).toEqual([
      0x3a, 0x6d, 0x45, 255,
    ]);
    expect(await ext.sw.evaluate(() => chrome.action.getBadgeText({}))).toBe("");
  });

  test("starts with empty lists and no dynamic rules", async ({ ext }) => {
    expect(await ext.dynamicRules()).toEqual([]);
    expect(await ext.getSync()).toEqual({});
  });
});
