// Stand-in for Google's IMA video ad SDK (imasdk.googleapis.com/js/sdkloader/ima3.js).
// rules/video-ads.json redirects the real SDK here. Every ad request answers
// with IMA's normal "no ad" error, which players already handle by going
// straight to the video. Blocking the SDK outright can leave a player waiting
// forever, which is why this exists. Written from Google's public IMA API docs.
(() => {
  const google = (window.google = window.google || {});
  if (google.ima) return;

  // Any enum value a player looks up, e.g. AdEvent.Type.STARTED. Players only
  // compare these against each other, so a stable string is enough.
  const anyEnum = () =>
    new Proxy({}, { get: (_, key) => (typeof key === "string" ? key.toLowerCase() : undefined) });

  // Settings objects: setters do nothing, getters return a plain default
  const SETTING_DEFAULTS = { getLocale: "en", getNumRedirects: 4, getVpaidMode: 0 };
  const anySettings = () =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          typeof key === "string" && key.startsWith("get")
            ? () => SETTING_DEFAULTS[key]
            : () => {},
      }
    );

  const AD_ERROR = "adError";
  const ADS_MANAGER_LOADED = "adsManagerLoaded";
  const VAST_EMPTY_RESPONSE = 1009;

  class AdError {
    getErrorCode() { return VAST_EMPTY_RESPONSE; }
    getVastErrorCode() { return 303; } // VAST "no ad"
    getType() { return "adLoadError"; }
    getMessage() { return "No ads available"; }
    getInnerError() { return null; }
    toString() { return `AdError ${VAST_EMPTY_RESPONSE}: ${this.getMessage()}`; }
  }

  class AdErrorEvent {
    constructor(userRequestContext) { this.userRequestContext = userRequestContext; }
    getError() { return new AdError(); }
    getUserRequestContext() { return this.userRequestContext ?? null; }
    get type() { return AD_ERROR; }
  }
  AdErrorEvent.Type = { AD_ERROR };

  class AdsLoader {
    constructor() {
      this.listeners = new Map();
      this.settings = anySettings();
    }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }
    requestAds(request, userRequestContext) {
      // Async like the real SDK, so listeners added right after still fire
      setTimeout(() => {
        const event = new AdErrorEvent(userRequestContext);
        for (const listener of this.listeners.get(AD_ERROR) ?? []) {
          try {
            listener.call(this, event);
          } catch (error) {
            console.error(error);
          }
        }
      }, 0);
    }
    getSettings() { return this.settings; }
    contentComplete() {}
    destroy() { this.listeners.clear(); }
    getVersion() { return google.ima.VERSION; }
  }

  class AdDisplayContainer {
    initialize() {}
    destroy() {}
  }

  // Plain objects players fill in before requesting ads
  class AdsRequest {
    setAdWillAutoPlay() {}
    setAdWillPlayMuted() {}
    setContinuousPlayback() {}
  }
  class AdsRenderingSettings {}
  class CompanionAdSelectionSettings {}

  google.ima = {
    VERSION: "3.0.0",
    settings: anySettings(),
    AdDisplayContainer,
    AdsLoader,
    AdsRequest,
    AdsRenderingSettings,
    CompanionAdSelectionSettings,
    AdError: Object.assign(AdError, { ErrorCode: anyEnum(), Type: anyEnum() }),
    AdErrorEvent,
    AdEvent: { Type: anyEnum() },
    AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED } },
    ImaSdkSettings: Object.assign(function ImaSdkSettings() { return anySettings(); }, {
      VpaidMode: { DISABLED: 0, ENABLED: 1, INSECURE: 2 },
      CompanionBackfillMode: { ALWAYS: "always", ON_MASTER_AD: "on_master_ad" },
    }),
    ViewMode: { NORMAL: "normal", FULLSCREEN: "fullscreen" },
    UiElements: { AD_ATTRIBUTION: "adAttribution", COUNTDOWN: "countdown" },
    OmidAccessMode: anyEnum(),
    OmidVerificationVendor: anyEnum(),
  };
})();
