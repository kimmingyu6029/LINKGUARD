const DEFAULT_SETTINGS = {
  apiBaseUrl: "http://127.0.0.1:5173",
  avatarInteractionMode: "calm",
  avatarModeEnabled: false,
  mode: "normal",
};

const tabUrlCache = new Map();

chrome.runtime.onInstalled.addListener(() => {
  initializeSettings();
});

chrome.runtime.onStartup.addListener(() => {
  initializeSettings();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const nextUrl = changeInfo.url || tab?.url;

  if (nextUrl && isInspectableUrl(nextUrl)) {
    analyzeTabUrl(tabId, nextUrl, "tab-updated");
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !isInspectableUrl(tab?.url)) {
      return;
    }

    analyzeTabUrl(tabId, tab.url, "tab-activated");
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabUrlCache.delete(tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
  handleNavigationEvent(details, "navigation-committed");
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  handleNavigationEvent(details, "history-state-updated");
});

chrome.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
  handleNavigationEvent(details, "fragment-updated");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LINKGUARD_GET_SETTINGS") {
    getSettings().then(sendResponse);
    return true;
  }

  if (message?.type === "LINKGUARD_SET_SETTINGS") {
    saveSettings(message.settings || {}).then((settings) => {
      broadcastSettings(settings);
      sendResponse(settings);
    });
    return true;
  }

  if (message?.type === "LINKGUARD_TEST_API_CONNECTION") {
    testApiConnection(message.settings || {}).then(sendResponse);
    return true;
  }

  if (message?.type === "LINKGUARD_ANALYZE_URL") {
    analyzeUrlForMessage(message).then(sendResponse);
    return true;
  }

  if (message?.type === "LINKGUARD_PAGE_URL_CHANGED" && sender.tab?.id) {
    analyzeTabUrl(sender.tab.id, message.url || sender.tab.url, "page-url-changed");
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

function handleNavigationEvent(details, source) {
  if (details.frameId !== 0 || !isInspectableUrl(details.url)) {
    return;
  }

  analyzeTabUrl(details.tabId, details.url, source);
}

async function initializeSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  await chrome.storage.sync.set({ ...DEFAULT_SETTINGS, ...stored });
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);

  return {
    apiBaseUrl: normalizeApiBaseUrl(stored.apiBaseUrl) || DEFAULT_SETTINGS.apiBaseUrl,
    avatarInteractionMode: normalizeAvatarInteractionMode(stored.avatarInteractionMode),
    avatarModeEnabled: stored.avatarModeEnabled !== false,
    mode: stored.mode === "expert" ? "expert" : "normal",
  };
}

async function saveSettings(partialSettings) {
  const settings = {
    ...(await getSettings()),
    ...partialSettings,
  };
  const normalizedSettings = {
    apiBaseUrl: normalizeApiBaseUrl(settings.apiBaseUrl) || DEFAULT_SETTINGS.apiBaseUrl,
    avatarInteractionMode: normalizeAvatarInteractionMode(settings.avatarInteractionMode),
    avatarModeEnabled: settings.avatarModeEnabled !== false,
    mode: settings.mode === "expert" ? "expert" : "normal",
  };

  await chrome.storage.sync.set(normalizedSettings);
  return normalizedSettings;
}

async function analyzeTabUrl(tabId, rawUrl, source) {
  if (!isInspectableUrl(rawUrl)) {
    return;
  }

  const settings = await getSettings();

  if (!settings.avatarModeEnabled) {
    sendTabMessage(tabId, {
      type: "LINKGUARD_AVATAR_SETTINGS",
      settings,
    });
    return;
  }

  const cacheKey = `${tabId}:${settings.mode}:${rawUrl}`;
  if (tabUrlCache.get(tabId) === cacheKey) {
    return;
  }
  tabUrlCache.set(tabId, cacheKey);

  sendTabMessage(tabId, {
    type: "LINKGUARD_URL_SCAN_PENDING",
    payload: {
      source,
      url: rawUrl,
    },
    settings,
  });

  try {
    const verdict = await requestUrlVerdict({
      apiBaseUrl: settings.apiBaseUrl,
      mode: settings.mode,
      url: rawUrl,
    });

    sendTabMessage(tabId, {
      type: "LINKGUARD_URL_VERDICT",
      payload: {
        source,
        url: rawUrl,
        verdict,
      },
      settings,
    });
  } catch (error) {
    sendTabMessage(tabId, {
      type: "LINKGUARD_URL_SCAN_ERROR",
      payload: {
        error: error.message || "URL scan failed.",
        source,
        url: rawUrl,
      },
      settings,
    });
  }
}

async function analyzeUrlForMessage(message) {
  try {
    const settings = {
      ...(await getSettings()),
      ...(message.settings || {}),
    };
    const url = typeof message.url === "string" ? message.url : "";

    if (!isInspectableUrl(url)) {
      return {
        error: "Only HTTP and HTTPS URLs can be scanned.",
        ok: false,
      };
    }

    const verdict = await requestUrlVerdict({
      apiBaseUrl: settings.apiBaseUrl,
      mode: settings.mode === "expert" ? "expert" : "normal",
      url,
    });

    return {
      ok: true,
      verdict,
    };
  } catch (error) {
    return {
      error: error.message || "Could not connect to the URL analysis API.",
      ok: false,
    };
  }
}

async function testApiConnection(partialSettings = {}) {
  const settings = {
    ...(await getSettings()),
    ...partialSettings,
  };

  try {
    const health = await fetchJson(buildApiEndpoint(settings.apiBaseUrl, "/api/health"), {
      method: "GET",
      timeoutMs: 6000,
    });
    const verdict = await requestUrlVerdict({
      apiBaseUrl: settings.apiBaseUrl,
      mode: settings.mode === "expert" ? "expert" : "normal",
      url: "https://example.com",
    });

    return {
      health,
      ok: true,
      verdictSummary: {
        score: verdict.score,
        statusLabel: verdict.statusLabel,
        tone: verdict.tone,
        verdict: verdict.verdict,
      },
    };
  } catch (error) {
    return {
      error: error.message || "Could not connect to the LinkGuard API.",
      ok: false,
    };
  }
}

async function requestUrlVerdict({ apiBaseUrl, mode, url }) {
  return fetchJson(buildApiEndpoint(apiBaseUrl, "/api/analyze-url"), {
    body: JSON.stringify({ mode, url }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    timeoutMs: 12000,
  });
}

async function fetchJson(endpoint, { timeoutMs = 10000, ...options } = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      ...options,
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = parseJsonPayload(text);

    if (!response.ok) {
      throw new Error(payload.error || text || `LinkGuard API response error: ${response.status}`);
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("LinkGuard API request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseJsonPayload(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("LinkGuard API returned an invalid JSON response.");
  }
}

function buildApiEndpoint(apiBaseUrl, path) {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl) || DEFAULT_SETTINGS.apiBaseUrl;
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function broadcastSettings(settings) {
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        sendTabMessage(tab.id, {
          type: "LINKGUARD_AVATAR_SETTINGS",
          settings,
        });
      }
    }
  });
}

function sendTabMessage(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Some pages cannot receive extension messages even with host access.
  });
}

function isInspectableUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeApiBaseUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.origin;
  } catch {
    return "";
  }
}

function normalizeAvatarInteractionMode(value) {
  return ["calm", "active", "focus"].includes(value) ? value : DEFAULT_SETTINGS.avatarInteractionMode;
}
