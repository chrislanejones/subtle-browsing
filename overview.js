// The top of the settings page: totals, charts of what was blocked, and a
// table of every kind of blocking. The counts come from the stats-YYYY-MM-DD
// keys background.js keeps for the last 30 days.
import { getBlockedUrls } from "./blocklist.js";
import {
  getPausedEverywhere,
  getAllPausedSites,
  getSettings,
  getSiteSettings,
} from "./settings.js";

const $ = (id) => document.getElementById(id);

// Fixed order: the colors in the options page follow it (--type-1 … --type-6)
export const TYPES = [
  { key: "video_ads", label: "Video ads" },
  { key: "personal", label: "Your list" },
  { key: "ad_churn", label: "Ad refresh and sync" },
  { key: "annoyances", label: "Newsletter offers" },
  { key: "notifications", label: "Notification requests" },
  { key: "heavy", label: "Heavy ads" },
  { key: "other", label: "Other" },
];
const color = (key) => `var(--type-${key})`;

// Every kind of blocking, for the "What gets blocked" table
const KINDS = [
  {
    type: "video_ads",
    setting: "videoAdRules",
    name: "Video ad companies",
    what: "Connatix, Primis, Teads and similar, plus Google's video ad engine",
    rules: "rules/video-ads.json",
  },
  {
    type: "personal",
    name: "Your block list",
    what: "URLs and domains you added, on every site",
    personal: true,
  },
  {
    type: "ad_churn",
    setting: "adChurnRules",
    name: "Ad refresh and sync frames",
    what: "Browsi ad refresh and hidden cookie-sync frames",
    rules: "rules/ad-churn.json",
  },
  {
    type: "annoyances",
    setting: "annoyanceRules",
    name: "Newsletter offers",
    what: "Newsletter sign-ups and promotional overlays",
    rules: "rules/annoyances.json",
  },
  {
    type: "notifications",
    setting: "notificationRules",
    name: "Notification requests",
    what: "Website push-prompt tools",
    rules: "rules/notifications.json",
  },
  {
    type: "heavy",
    setting: "heavyAds",
    name: "Heavy ads",
    what: "Ad frames over 4 MB, or hogging the CPU",
    rule: "Size and CPU limit",
  },
  {
    setting: "autoplayGuard",
    name: "Muted autoplay videos",
    what: "Paused until you click; videos you start still play",
    rule: "Page script",
  },
  {
    setting: "refreshThrottle",
    name: "Slow ad refresh",
    what: "Each Google ad slot refreshes at most every 2 minutes",
    rule: "Page script",
  },
  {
    setting: "adRedirectGuard",
    name: "Stop ad redirects",
    what: "Ads can't send the tab to another site without a click",
    rule: "Page script",
  },
  {
    setting: "pinnedAds",
    name: "Pinned ads",
    what: "Ads pinned to the window scroll away with the page",
    rule: "Page style",
  },
  {
    setting: "aggressiveHeavyAds",
    name: "All heavy third-party embeds",
    what: "Heavy ads, widened to any third-party frame",
    rule: "Size and CPU limit",
  },
];

const localDate = (date) => date.toLocaleDateString("en-CA");
function lastDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(localDate(date));
  }
  return days;
}
const sum = (values) => values.reduce((a, b) => a + b, 0);
const fmt = (n) => n.toLocaleString();

function totals(stats, days, field) {
  const out = {};
  for (const day of days)
    for (const [key, n] of Object.entries(stats[day]?.[field] ?? {}))
      out[key] = (out[key] ?? 0) + n;
  return out;
}
const dayTotal = (stats, day) => sum(Object.values(stats[day]?.types ?? {}));

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "style") Object.assign(node.style, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

// One tooltip for every chart, filled with textContent only
const tooltip = el("div", {
  className: "viz-tooltip",
  role: "status",
  hidden: true,
});
document.body.append(tooltip);
function showTip(target, title, rows) {
  tooltip.replaceChildren(
    el("strong", {}, title),
    ...rows.map(([label, value, key]) =>
      el(
        "span",
        { className: "tip-row" },
        key
          ? el("i", { className: "key", style: { background: color(key) } })
          : null,
        el("b", {}, value),
        ` ${label}`,
      ),
    ),
  );
  tooltip.hidden = false;
  const box = target.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();
  const left = Math.min(
    Math.max(8, box.left + box.width / 2 - tip.width / 2),
    innerWidth - tip.width - 8,
  );
  const top =
    box.top - tip.height - 8 < 8 ? box.bottom + 8 : box.top - tip.height - 8;
  tooltip.style.left = `${left + scrollX}px`;
  tooltip.style.top = `${top + scrollY}px`;
}
const hideTip = () => (tooltip.hidden = true);
function hoverable(node, title, rows) {
  node.tabIndex = 0;
  const show = () => showTip(node, title, rows);
  node.addEventListener("pointerenter", show);
  node.addEventListener("focus", show);
  node.addEventListener("pointerleave", hideTip);
  node.addEventListener("blur", hideTip);
}

function tile(label, value, note) {
  return el(
    "div",
    { className: "tile card" },
    el("span", { className: "tile-label" }, label),
    el("span", { className: "tile-value" }, value),
    note ? el("span", { className: "tile-note" }, note) : null,
  );
}

function legend(keys) {
  return el(
    "ul",
    { className: "legend" },
    ...keys.map((key) =>
      el(
        "li",
        {},
        el("i", { className: "key", style: { background: color(key) } }),
        TYPES.find((t) => t.key === key).label,
      ),
    ),
  );
}

function dataTable(caption, head, rows) {
  return el(
    "details",
    { className: "table-view" },
    el("summary", {}, "Show as a table"),
    el(
      "table",
      {},
      el("caption", { className: "sr-only" }, caption),
      el(
        "thead",
        {},
        el("tr", {}, ...head.map((h) => el("th", { scope: "col" }, h))),
      ),
      el(
        "tbody",
        {},
        ...rows.map((r) =>
          el(
            "tr",
            {},
            ...r.map((c, i) =>
              el(i ? "td" : "th", i ? {} : { scope: "row" }, String(c)),
            ),
          ),
        ),
      ),
    ),
  );
}

// Blocks per day, stacked by type
function perDayChart(stats, days) {
  const used = TYPES.filter((t) => days.some((d) => stats[d]?.types?.[t.key]));
  const max = Math.max(1, ...days.map((d) => dayTotal(stats, d)));
  const short = (day) =>
    new Date(`${day}T12:00`).toLocaleDateString(undefined, {
      month: "numeric",
      day: "numeric",
    });
  const weekday = (day) =>
    new Date(`${day}T12:00`).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  const bars = days.map((day) => {
    const types = stats[day]?.types ?? {};
    const total = dayTotal(stats, day);
    const column = el(
      "div",
      {
        className: "col-bar",
        "aria-label": `${weekday(day)}: ${fmt(total)} blocked`,
      },
      el(
        "div",
        { className: "stack", style: { height: `${(total / max) * 100}%` } },
        ...used
          .filter((t) => types[t.key])
          .map((t) =>
            el("div", {
              className: "seg",
              style: { flexGrow: types[t.key], background: color(t.key) },
            }),
          ),
      ),
      el("span", { className: "col-label" }, short(day)),
    );
    hoverable(
      column,
      `${weekday(day)} · ${fmt(total)} blocked`,
      used
        .filter((t) => types[t.key])
        .map((t) => [t.label, fmt(types[t.key]), t.key]),
    );
    return column;
  });
  return el(
    "div",
    {},
    used.length > 1 ? legend(used.map((t) => t.key)) : null,
    el(
      "div",
      { className: "columns" },
      el("div", { className: "y-max" }, fmt(max)),
      ...bars,
    ),
    dataTable(
      "Blocks per day",
      ["Day", "Total", ...used.map((t) => t.label)],
      days.map((d) => [
        weekday(d),
        fmt(dayTotal(stats, d)),
        ...used.map((t) => fmt(stats[d]?.types?.[t.key] ?? 0)),
      ]),
    ),
  );
}

// Horizontal bars, longest first. keyOf picks a color per row, or none.
function barList(entries, { keyOf, label = (k) => k, unit = "blocked" } = {}) {
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return el(
    "ol",
    { className: "bars" },
    ...entries.map(([key, n]) => {
      const row = el(
        "li",
        { "aria-label": `${label(key)}: ${fmt(n)} ${unit}` },
        el("span", { className: "bar-name", title: label(key) }, label(key)),
        el(
          "span",
          { className: "bar-track" },
          el("span", {
            className: "bar-fill",
            style: {
              width: `${(n / max) * 100}%`,
              background: keyOf ? color(keyOf(key)) : "var(--type-single)",
            },
          }),
        ),
        el("span", { className: "bar-value" }, fmt(n)),
      );
      hoverable(row, label(key), [[unit, fmt(n), keyOf?.(key)]]);
      return row;
    }),
  );
}

const empty = (text) => el("p", { className: "note empty" }, text);

async function render() {
  const [local, sync, settings, siteSettings, urls, paused, off] =
    await Promise.all([
      chrome.storage.local.get([
        "blockedToday",
        "blockedUrlLogs",
        ...lastDays(30).map((day) => `stats-${day}`),
      ]),
      chrome.storage.sync.get("hiddenElements"),
      getSettings(),
      getSiteSettings(),
      getBlockedUrls(),
      getAllPausedSites(),
      getPausedEverywhere(),
    ]);
  const { blockedToday, blockedUrlLogs = [] } = local;
  const stats = Object.fromEntries(
    Object.entries(local)
      .filter(([key]) => key.startsWith("stats-"))
      .map(([key, day]) => [key.slice("stats-".length), day]),
  );
  const canCount = Boolean(chrome.declarativeNetRequest.onRuleMatchedDebug);
  const today = localDate(new Date());
  const week = lastDays(7);
  const month = lastDays(30);
  const todayCount = blockedToday?.date === today ? blockedToday.count : 0;
  const weekTotal = sum(week.map((d) => dayTotal(stats, d)));
  const monthTotal = sum(month.map((d) => dayTotal(stats, d)));
  const hidden = (sync.hiddenElements ?? []).length;
  const overrides = Object.keys(siteSettings).length;

  $("tiles").replaceChildren(
    tile("Blocked today", canCount ? fmt(todayCount) : "Unavailable"),
    tile("Last 7 days", canCount ? fmt(weekTotal) : "Unavailable"),
    tile(
      "Last 30 days",
      canCount ? fmt(monthTotal) : "Unavailable",
      canCount && Object.keys(stats).length < 30
        ? `Counting since ${Object.keys(stats).sort()[0] ?? "today"}`
        : null,
    ),
    tile("Your blocked URLs", fmt(urls.length)),
    tile(
      "Paused sites",
      fmt(paused.length),
      off ? "Off everywhere is on" : null,
    ),
    tile(
      "Hidden elements",
      fmt(hidden),
      `${fmt(overrides)} site ${overrides === 1 ? "override" : "overrides"}`,
    ),
  );

  $("countNote").hidden = canCount;

  const days = lastDays(14);
  $("perDay").replaceChildren(
    days.some((d) => dayTotal(stats, d))
      ? perDayChart(stats, days)
      : empty("Nothing blocked yet in the last 14 days."),
  );

  const byType = totals(stats, week, "types");
  const typeRows = TYPES.filter((t) => byType[t.key])
    .map((t) => [t.key, byType[t.key]])
    .sort(([, a], [, b]) => b - a);
  $("byType").replaceChildren(
    typeRows.length
      ? barList(typeRows, {
          keyOf: (k) => k,
          label: (k) => TYPES.find((t) => t.key === k).label,
        })
      : empty("Nothing blocked yet this week."),
  );

  const top = (field) =>
    Object.entries(totals(stats, week, field))
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10);
  const hosts = top("hosts");
  $("topHosts").replaceChildren(
    hosts.length ? barList(hosts) : empty("Nothing blocked yet this week."),
  );
  const pages = top("pages");
  $("topPages").replaceChildren(
    pages.length ? barList(pages) : empty("Nothing blocked yet this week."),
  );

  if (!canCount) {
    for (const id of ["perDay", "byType", "topHosts", "topPages"])
      $(id).replaceChildren(
        empty(
          "Network activity is unavailable in this install, not zero. Use the toolbar for this tab’s request count.",
        ),
      );
  }

  // Recent blocks, newest first
  const recent = blockedUrlLogs
    .filter((entry) => canCount || entry.type === "heavy")
    .slice(-12)
    .reverse();
  $("recent").replaceChildren(
    recent.length
      ? el(
          "table",
          { className: "recent" },
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              ...["Time", "Type", "Blocked", "On"].map((h) =>
                el("th", { scope: "col" }, h),
              ),
            ),
          ),
          el(
            "tbody",
            {},
            ...recent.map((entry) => {
              const type =
                TYPES.find((t) => t.key === entry.type) ?? TYPES.at(-1);
              const host = entry.host ?? hostFrom(entry.url) ?? entry.url;
              return el(
                "tr",
                {},
                el(
                  "td",
                  { className: "num" },
                  new Date(entry.timestamp).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  }),
                ),
                el(
                  "td",
                  {},
                  el("i", {
                    className: "key",
                    style: { background: color(type.key) },
                  }),
                  ` ${type.label}`,
                ),
                el("td", { className: "url", title: entry.url }, host),
                el("td", { className: "url" }, entry.page ?? "—"),
              );
            }),
          ),
        )
      : empty(
          canCount
            ? "Nothing blocked yet."
            : "No heavy-content removals observed. Network logs are unavailable.",
        ),
  );

  // What gets blocked
  const ruleCounts = await ruleCountsPromise;
  $("kinds").replaceChildren(
    ...KINDS.map((kind) => {
      const on = kind.personal ? urls.length > 0 : settings[kind.setting];
      const rules = kind.personal
        ? `${fmt(urls.length)} ${urls.length === 1 ? "URL" : "URLs"}`
        : kind.rules
          ? `${fmt(ruleCounts[kind.rules] ?? 0)} rules`
          : kind.rule;
      const count = kind.type ? (byType[kind.type] ?? 0) : null;
      return el(
        "tr",
        {},
        el(
          "th",
          { scope: "row" },
          kind.type
            ? el("i", {
                className: "key",
                style: { background: color(kind.type) },
              })
            : el("i", { className: "key none" }),
          ` ${kind.name}`,
        ),
        el("td", {}, kind.what),
        el("td", {}, rules),
        el(
          "td",
          {},
          el(
            "span",
            { className: `state ${on ? "on" : "off"}` },
            off ? "Off everywhere" : on ? "On" : "Off",
          ),
        ),
        el(
          "td",
          { className: "num" },
          count === null
            ? "—"
            : !canCount && kind.type !== "heavy"
              ? "Unavailable"
              : fmt(count),
        ),
      );
    }),
  );
}

function hostFrom(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const ruleCountsPromise = Promise.all(
  KINDS.filter((k) => k.rules).map(async (k) => [
    k.rules,
    (await (await fetch(chrome.runtime.getURL(k.rules))).json()).length,
  ]),
).then(Object.fromEntries);

// A busy tab elsewhere changes storage about once a second. Redraw at most
// every 5 seconds, and not at all while this tab is hidden.
export async function mountOverview() {
  await render();
  let timer = null;
  let stale = false;
  const redraw = () => {
    if (document.hidden) {
      stale = true;
      return;
    }
    timer ??= setTimeout(() => {
      timer = null;
      render();
    }, 5000);
  };
  chrome.storage.onChanged.addListener(redraw);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && stale) {
      stale = false;
      render();
    }
  });
}
