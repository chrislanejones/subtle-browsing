import { mountRuleForm } from "./rule-form.js";
import { mutate } from "./storage-client.js";
import { mountSavedRules } from "./controls.js";
import { mountOverview } from "./overview.js";
import {
  getBlockedUrls,
  normalizeImportedRule,
  ruleLabel,
  onBlockedUrlsChanged,
  removeBlockedUrl,
} from "./blocklist.js";
import {
  getPausedSites,
  getPausedEverywhere,
  onPausedEverywhereChanged,
  getSettings,
  onPausedSitesChanged,
  onSettingsChanged,
  setSitePaused,
  siteKey,
  updateSettings,
  getSiteSettings,
  validSite,
  FEATURES,
} from "./settings.js";

const $ = (id) => document.getElementById(id);
const urlInput = $("urlInput");
const searchInput = $("searchInput");
const blockedStatus = $("blockedStatus");
const backupStatus = $("backupStatus");

$("version").textContent = `Version ${chrome.runtime.getManifest().version}`;
await mountOverview();
async function renderPowerState() {
  const off = await getPausedEverywhere();
  $("powerState").textContent = off ? "Off everywhere" : "Blocking is on";
  $("powerState").dataset.off = off;
  $("resumeBlocking").hidden = !off;
}
await renderPowerState();
onPausedEverywhereChanged(renderPowerState);
$("resumeBlocking").addEventListener("click", async () => {
  $("resumeBlocking").disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({
      action: "setPower",
      mode: "on",
    });
    if (!result?.ok)
      throw new Error(result?.error ?? "Could not resume blocking.");
    blockedStatus.textContent =
      "Blocking resumed. Reload pages to restore removed content.";
  } catch (error) {
    blockedStatus.textContent = error.message;
  } finally {
    $("resumeBlocking").disabled = false;
    await renderPowerState();
  }
});

// Blocking switches, kept in step with the popup
const toggles = {
  videoAdRules: $("videoAdRulesToggle"),
  autoplayGuard: $("autoplayGuardToggle"),
  heavyAds: $("heavyAdsToggle"),
  notificationRules: document.getElementById("notificationRulesToggle"),
  adChurnRules: document.getElementById("adChurnRulesToggle"),
  refreshThrottle: document.getElementById("refreshThrottleToggle"),
  adRedirectGuard: document.getElementById("adRedirectGuardToggle"),
  pinnedAds: document.getElementById("pinnedAdsToggle"),
  aggressiveHeavyAds: document.getElementById("aggressiveHeavyAdsToggle"),
  annoyanceRules: $("annoyanceRulesToggle"),
};
function renderToggles(settings) {
  for (const [key, checkbox] of Object.entries(toggles))
    checkbox.checked = settings[key];
}
renderToggles(await getSettings());
onSettingsChanged(renderToggles);
for (const [key, checkbox] of Object.entries(toggles)) {
  checkbox.addEventListener("change", async () => {
    try {
      await updateSettings({ [key]: checkbox.checked });
    } catch (error) {
      checkbox.checked = !checkbox.checked;
      blockedStatus.textContent = error.message;
    }
  });
}

function listRow(text, buttonLabel, onClick) {
  const row = document.createElement("div");
  row.className = "url-item";
  const label = document.createElement("span");
  label.textContent = text;
  label.title = text;
  const button = document.createElement("button");
  button.className = "remove-btn";
  button.textContent = buttonLabel;
  button.setAttribute("aria-label", `${buttonLabel} ${text}`);
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await onClick();
    } catch (error) {
      blockedStatus.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  row.append(label, button);
  return row;
}

function emptyRow(text) {
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = text;
  return empty;
}

// Blocked URLs, newest first, filtered by the search box
let blockedUrls = await getBlockedUrls();
function renderBlockedUrls() {
  const query = searchInput.value.trim().toLowerCase();
  const shown = blockedUrls
    .toReversed()
    .filter((url) => url.toLowerCase().includes(query));
  $("blockedCount").textContent = query
    ? `${shown.length} of ${blockedUrls.length}`
    : `${blockedUrls.length} total`;

  if (shown.length === 0) {
    $("urlList").replaceChildren(
      emptyRow(query ? "Nothing matches." : "No URLs blocked yet."),
    );
    return;
  }
  const rows = document.createDocumentFragment();
  for (const url of shown)
    rows.append(listRow(ruleLabel(url), "Remove", () => removeBlockedUrl(url)));
  $("urlList").replaceChildren(rows);
}
renderBlockedUrls();
onBlockedUrlsChanged((urls) => {
  blockedUrls = urls;
  renderBlockedUrls();
});
searchInput.addEventListener("input", renderBlockedUrls);

mountRuleForm(urlInput, $("addButton"), blockedStatus);

// Paused sites
async function renderPausedSites() {
  const sites = await getPausedSites();
  const { temporaryPauses = {} } =
    await chrome.storage.local.get("temporaryPauses");
  const temporary = Object.entries(temporaryPauses).filter(
    ([, until]) => until > Date.now(),
  );
  $("pausedCount").textContent =
    `${sites.length + temporary.filter(([site]) => !sites.includes(site)).length} total`;
  const rows = document.createDocumentFragment();
  for (const site of sites)
    rows.append(listRow(site, "Unpause", () => setSitePaused(site, false)));
  for (const [site, until] of temporary) {
    if (sites.includes(site)) continue;
    rows.append(
      listRow(
        `${site} (until ${new Date(until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`,
        "Resume",
        async () => {
          const result = await chrome.runtime.sendMessage({
            action: "setPower",
            mode: "on",
            site,
          });
          if (!result?.ok)
            throw new Error(result?.error ?? "Could not resume blocking.");
        },
      ),
    );
  }
  if (!rows.childNodes.length) rows.append(emptyRow("No paused sites."));
  $("pausedList").replaceChildren(rows);
}
await renderPausedSites();
onPausedSitesChanged(renderPausedSites);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.temporaryPauses) renderPausedSites();
});

// Keyboard shortcuts: Chrome only lets the user change them on its own page
async function renderShortcut() {
  const commands = await chrome.commands.getAll();
  for (const [name, id] of [
    ["start-picker", "shortcutDesc"],
    ["toggle-site", "toggleShortcutDesc"],
  ]) {
    const shortcut = commands.find(
      (command) => command.name === name,
    )?.shortcut;
    const desc = $(id);
    if (shortcut) {
      const key = document.createElement("kbd");
      key.textContent = shortcut;
      desc.replaceChildren(key);
    } else {
      desc.textContent = "Not set";
    }
  }
}
renderShortcut();
$("shortcutButton").addEventListener("click", () =>
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" }),
);
// Picks up a change made on that page when the user comes back
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) renderShortcut();
});

// Backup. The file name date is MM-DD-YYYY, since a person reads it.
$("exportButton").addEventListener("click", async () => {
  const backup = {
    app: "subtle-browsing",
    version: chrome.runtime.getManifest().version,
    exportedAt: new Date().toISOString(),
    blockedUrls: await getBlockedUrls(),
    pausedSites: await getPausedSites(),
    settings: await getSettings(),
    siteSettings: await getSiteSettings(),
    hiddenElements:
      (await chrome.storage.sync.get("hiddenElements")).hiddenElements ?? [],
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  const [year, month, day] = new Date().toLocaleDateString("en-CA").split("-");
  link.href = URL.createObjectURL(blob);
  link.download = `url-blocker-backup-${month}-${day}-${year}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  backupStatus.className = "status ok";
  backupStatus.textContent = "Backup saved to your downloads.";
});

$("importButton").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  event.target.value = ""; // Lets the same file be picked again
  if (!file) return;
  backupStatus.className = "status";

  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    backupStatus.textContent = "That file isn't a URL Blocker backup.";
    return;
  }
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    backupStatus.textContent = "That file isn't a URL Blocker backup.";
    return;
  }
  const incomingOverrides = {};
  for (const [site, values] of Object.entries(backup.siteSettings ?? {})) {
    if (!validSite(site) || !values || typeof values !== "object") continue;
    const clean = Object.fromEntries(
      Object.entries(values).filter(
        ([key, value]) => key in FEATURES && typeof value === "boolean",
      ),
    );
    if (Object.keys(clean).length) incomingOverrides[site] = clean;
  }
  const incomingHidden = (
    Array.isArray(backup.hiddenElements) ? backup.hiddenElements : []
  )
    .filter((rule) => {
      if (
        !rule ||
        !validSite(rule.site) ||
        typeof rule.selector !== "string" ||
        rule.selector.length > 2000 ||
        /[{}]/.test(rule.selector)
      )
        return false;
      try {
        document.querySelector(rule.selector);
        return Boolean(rule.selector);
      } catch {
        return false;
      }
    })
    .map(({ site, selector }) => ({ site, selector }));
  const strings = (value) =>
    Array.isArray(value)
      ? value.filter((item) => typeof item === "string")
      : [];
  const incomingUrls = strings(backup.blockedUrls)
    .map((value) => {
      try {
        return normalizeImportedRule(value);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const incomingSites = strings(backup.pausedSites)
    .map((site) => siteKey(site.trim().toLowerCase()))
    .filter(Boolean);
  const incomingSettings = Object.fromEntries(
    Object.keys(toggles)
      .filter((key) => typeof backup.settings?.[key] === "boolean")
      .map((key) => [key, backup.settings[key]]),
  );
  if (
    typeof backup.settings?.annoyanceRules === "boolean" &&
    typeof backup.settings.notificationRules !== "boolean"
  )
    incomingSettings.notificationRules = backup.settings.annoyanceRules;
  if (
    incomingUrls.length +
      incomingSites.length +
      Object.keys(incomingSettings).length +
      incomingHidden.length +
      Object.keys(incomingOverrides).length ===
    0
  ) {
    backupStatus.textContent = "That file isn't a URL Blocker backup.";
    return;
  }

  try {
    const result = await mutate("importBackup", {
      blockedUrls: incomingUrls,
      pausedSites: incomingSites,
      settings: incomingSettings,
      siteSettings: incomingOverrides,
      hiddenElements: incomingHidden,
    });
    backupStatus.className = "status ok";
    backupStatus.textContent = `Imported ${result.urls} URLs and ${result.sites} paused sites.`;
  } catch (error) {
    backupStatus.textContent = error.message;
  }
});

await mountSavedRules(document.getElementById("savedRules"));
