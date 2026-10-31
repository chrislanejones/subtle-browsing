import { readSync, writeSync } from "./sync-storage.js";
import {
  normalizeUrl,
  normalizeImportedRule,
  ruleCondition,
  SYNC_FULL_MESSAGE,
} from "./blocklist.js";
import { FEATURES, normalizeSettings, validSite, siteKey } from "./settings.js";

// Called only inside background.js's queue, including imports and picker edits.
export async function applyMutation(operation, data) {
  const current = await readSync(null, { strict: true });
  let update;
  let result = {};
  switch (operation) {
    case "blockUrl": {
      const value = normalizeUrl(data.url, data.mode);
      const urls = current.blockedUrls ?? [];
      if (!value || urls.includes(value)) return { added: false, value };
      const condition = ruleCondition(value);
      if (!condition) throw new Error("This rule cannot be applied.");
      if (condition.regexFilter) {
        const supported = await chrome.declarativeNetRequest.isRegexSupported({
          regex: condition.regexFilter,
          isCaseSensitive: true,
        });
        if (!supported.isSupported)
          throw new Error("This URL is too complex to block exactly.");
      }
      update = { blockedUrls: [...urls, value] };
      result = { added: true, value };
      break;
    }
    case "removeUrl":
      update = {
        blockedUrls: (current.blockedUrls ?? []).filter((v) => v !== data.url),
      };
      break;
    case "settings": {
      const clean = Object.fromEntries(
        Object.entries(data.changes ?? {}).filter(
          ([k, v]) => Object.hasOwn(FEATURES, k) && typeof v === "boolean",
        ),
      );
      update = {
        settings: { ...normalizeSettings(current.settings), ...clean },
      };
      break;
    }
    case "pauseSite": {
      if (!validSite(data.site)) throw new Error("Invalid site.");
      const sites = (current.pausedSites ?? []).filter((s) => s !== data.site);
      if (data.paused) sites.push(data.site);
      update = { pausedSites: sites };
      break;
    }
    case "siteSetting": {
      if (
        !validSite(data.site) ||
        !Object.hasOwn(FEATURES, data.key) ||
        ![true, false, null].includes(data.value)
      )
        throw new Error("Invalid site setting.");
      const sites = current.siteSettings ?? {};
      const entry = { ...sites[data.site] };
      if (data.value === null) delete entry[data.key];
      else entry[data.key] = data.value;
      if (Object.keys(entry).length) sites[data.site] = entry;
      else delete sites[data.site];
      update = { siteSettings: sites };
      break;
    }
    case "resetSite": {
      const sites = current.siteSettings ?? {};
      delete sites[data.site];
      update = { siteSettings: sites };
      break;
    }
    case "unhide":
      update = {
        hiddenElements: (current.hiddenElements ?? []).filter(
          (r) => r.site !== data.site || r.selector !== data.selector,
        ),
      };
      break;
    case "importBackup": {
      const safeRule = (value) => {
        try {
          return normalizeImportedRule(value);
        } catch {
          return null;
        }
      };
      const urls = [
        ...new Set((data.blockedUrls ?? []).map(safeRule).filter(Boolean)),
      ];
      const sites = [
        ...new Set(
          (data.pausedSites ?? [])
            .filter((v) => typeof v === "string")
            .map((v) => siteKey(v.trim().toLowerCase()))
            .filter(validSite),
        ),
      ];
      const newUrls = urls.filter(
        (v) => !(current.blockedUrls ?? []).includes(v),
      );
      const newSites = sites.filter(
        (v) => !(current.pausedSites ?? []).includes(v),
      );
      const overrides = current.siteSettings ?? {};
      for (const [site, values] of Object.entries(data.siteSettings ?? {})) {
        if (!validSite(site) || !values || typeof values !== "object") continue;
        const clean = Object.fromEntries(
          Object.entries(values).filter(
            ([k, v]) => Object.hasOwn(FEATURES, k) && typeof v === "boolean",
          ),
        );
        if (Object.keys(clean).length)
          overrides[site] = { ...overrides[site], ...clean };
      }
      const hidden = current.hiddenElements ?? [];
      for (const rule of data.hiddenElements ?? []) {
        if (
          !rule ||
          !validSite(rule.site) ||
          typeof rule.selector !== "string" ||
          !rule.selector ||
          rule.selector.length > 2000 ||
          /[{}]/.test(rule.selector)
        )
          continue;
        if (
          !hidden.some(
            (r) => r.site === rule.site && r.selector === rule.selector,
          )
        )
          hidden.push({ site: rule.site, selector: rule.selector });
      }
      const settings = Object.fromEntries(
        Object.entries(data.settings ?? {}).filter(
          ([k, v]) => Object.hasOwn(FEATURES, k) && typeof v === "boolean",
        ),
      );
      update = {
        blockedUrls: [...(current.blockedUrls ?? []), ...newUrls],
        pausedSites: [...(current.pausedSites ?? []), ...newSites],
        settings: { ...normalizeSettings(current.settings), ...settings },
        ...(Object.keys(overrides).length ? { siteSettings: overrides } : {}),
        ...(hidden.length ? { hiddenElements: hidden } : {}),
      };
      result = { urls: newUrls.length, sites: newSites.length };
      break;
    }
    default:
      throw new Error("Unknown change.");
  }
  try {
    await writeSync(update);
  } catch (error) {
    throw new Error(
      /quota.*bytes|bytes.*quota/i.test(error.message)
        ? SYNC_FULL_MESSAGE
        : `Could not save: ${error.message}`,
    );
  }
  return result;
}
