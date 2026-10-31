import { readSync, syncChanged, onSyncChanged } from "./sync-storage.js";
import { mutate } from "./storage-client.js";
import {
  FEATURES,
  getSettings,
  updateSettings,
  getSiteSettings,
  siteKey,
  getPauseState,
} from "./settings.js";

// Shared across toolbar, settings and DevTools. Native selects make the
// distinction between inherited defaults and explicit site choices visible.
export async function mountSiteControls(container, tab) {
  if (!container || !/^https?:/.test(tab?.url ?? "")) return;
  const site = siteKey(new URL(tab.url).hostname);
  container.hidden = false;
  const effective = document.createElement("p");
  effective.className = "row-desc site-state";
  effective.id = "effectiveSiteState";
  effective.setAttribute("role", "status");
  container.before(effective);
  const heading = document.createElement("summary");
  heading.textContent = `Controls for ${site}`;
  const note = document.createElement("p");
  note.className = "row-desc";
  note.textContent =
    "Applies here and to subdomains. Changes reload this tab. Personal URL blocks stay active. A full site pause overrides these controls.";
  const status = document.createElement("p");
  status.className = "status";
  status.setAttribute("role", "status");
  const body = document.createElement("div");
  body.append(note);
  const selects = {};
  for (const [key, title] of Object.entries(FEATURES)) {
    const label = document.createElement("label");
    label.className = "site-control";
    const text = document.createElement("span");
    text.textContent = title;
    const select = document.createElement("select");
    select.setAttribute("aria-label", `${title} on this site`);
    for (const [value, title] of [
      ["", "Use default"],
      ["true", "On"],
      ["false", "Off"],
    ]) {
      select.add(new Option(title, value));
    }
    selects[key] = select;
    select.addEventListener("change", async () => {
      select.disabled = true;
      try {
        const response = await chrome.runtime.sendMessage({
          action: "setSiteSetting",
          site,
          key,
          value: select.value === "" ? null : select.value === "true",
          tabId: tab.id,
        });
        if (response?.error) throw new Error(response.error);
        status.textContent = "Saved. Tab reloaded.";
      } catch (error) {
        status.textContent = `Could not save: ${error.message}`;
      } finally {
        select.disabled = false;
        await render();
      }
    });
    label.append(text, select);
    body.append(label);
  }
  const warning = document.createElement("p");
  warning.className = "row-desc";
  warning.textContent =
    "All heavy embeds extends Heavy ads to unrecognized third-party frames. It can stop legitimate videos and tools. Restore them on the page.";
  body.append(warning, status);
  container.replaceChildren(heading, body);
  async function render() {
    const [settings, sites] = await Promise.all([
      getSettings(),
      getSiteSettings(),
    ]);
    const inherited = Object.assign(
      {},
      settings,
      ...Object.entries(sites)
        .filter(([host]) => host !== site && site.endsWith(`.${host}`))
        .sort(([a], [b]) => a.length - b.length)
        .map(([, value]) => value),
    );
    const state = { ...inherited, ...sites[site] };
    const pause = await getPauseState(site);
    effective.textContent =
      pause.mode !== "on"
        ? "Protections paused on this site."
        : `On this site: video ads ${state.videoAdRules ? "blocked" : "allowed"}, muted autoplay ${state.autoplayGuard ? "paused" : "allowed"}, heavy ads ${state.heavyAds ? "limited" : "allowed"}.`;
    for (const [key, select] of Object.entries(selects)) {
      select.value =
        typeof sites[site]?.[key] === "boolean" ? String(sites[site][key]) : "";
      select.options[0].textContent = `Default (${inherited[key] ? "on" : "off"})`;
    }
  }
  await render();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      (area === "sync" &&
        syncChanged(changes, ["settings", "siteSettings", "pausedSites", "pausedEverywhere"])) ||
      (area === "local" && changes.temporaryPauses)
    )
      render();
  });
}

export async function mountGlobalControls(container) {
  const title = document.createElement("summary");
  title.textContent = "Default protections";
  container.append(title);
  const settings = await getSettings();
  for (const [key, name] of Object.entries(FEATURES)) {
    const label = document.createElement("label");
    label.className = "site-control";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = settings[key];
    input.addEventListener("change", async () => {
      try {
        await updateSettings({ [key]: input.checked });
      } catch {
        input.checked = !input.checked;
        container.querySelector('[role="status"]').textContent =
          "Could not save this setting.";
      }
    });
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (area === "sync" && changes.settings)
        input.checked = (await getSettings())[key];
    });
    label.append(name, input);
    container.append(label);
  }
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  container.append(status);
}

export async function mountSavedRules(container, site = null) {
  const list = document.createElement("div");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  container.replaceChildren(list, status);
  async function render() {
    const { hiddenElements = [], siteSettings = {} } =
      await readSync(["hiddenElements", "siteSettings"]);
    const fragment = document.createDocumentFragment();
    for (const rule of hiddenElements.filter((r) => !site || r.site === site)) {
      const row = document.createElement("div");
      row.className = "saved-rule";
      const label = document.createElement("span");
      label.textContent = `${rule.site}: ${rule.selector}`;
      const button = document.createElement("button");
      button.textContent = "Unhide";
      button.setAttribute(
        "aria-label",
        `Unhide ${rule.selector} on ${rule.site}`,
      );
      button.className = "btn";
      button.addEventListener("click", async () => {
        try {
          await mutate("unhide", { site: rule.site, selector: rule.selector });
          status.textContent = "Element restored.";
        } catch (error) {
          status.textContent = error.message;
        }
      });
      row.append(label, button);
      fragment.append(row);
    }
    for (const [host, settings] of Object.entries(siteSettings).filter(
      ([host]) => !site || host === site,
    )) {
      const row = document.createElement("div");
      row.className = "saved-rule";
      const label = document.createElement("span");
      label.textContent = `${host}: ${Object.entries(settings)
        .map(([key, on]) => `${FEATURES[key]} ${on ? "on" : "off"}`)
        .join(", ")}`;
      const button = document.createElement("button");
      button.textContent = "Reset site";
      button.setAttribute("aria-label", `Reset site ${host}`);
      button.className = "btn";
      button.addEventListener("click", async () => {
        try {
          await mutate("resetSite", { site: host });
          status.textContent =
            "Reset. Reload the site to apply to existing content.";
        } catch (error) {
          status.textContent = error.message;
        }
      });
      row.append(label, button);
      fragment.append(row);
    }
    if (!fragment.childNodes.length)
      fragment.append("No hidden elements or site overrides yet.");
    list.replaceChildren(fragment);
  }
  onSyncChanged(["hiddenElements", "siteSettings"], render);
  await render();
}
