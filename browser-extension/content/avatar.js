const ROOT_ID = "linkguard-url-helper-root";
const BLOCKER_ID = "linkguard-url-blocker";
const PAGE_AVATAR_MODE_ATTRIBUTE = "data-linkguard-avatar-mode";
const PAGE_AVATAR_MODE_STORAGE_KEY = "linkguard-avatar-mode";
const PAGE_AVATAR_MODE_EVENT = "linkguard-avatar-mode-change";
const GREETINGS = [
  "URL을 조용히 지켜보고 있어요.",
  "새 링크는 열릴 때마다 빠르게 확인할게요.",
  "페이지가 바뀌면 위험 신호를 바로 살펴볼게요.",
  "안전한 탐색, 링크 하나씩 함께 확인해요.",
];
const AVATAR_WIDTH = 76;
const AVATAR_HEIGHT = 116;
const AVATAR_MARGIN = 14;
const AVATAR_ACTIVE_SPEED = 820;
const AVATAR_MODES = [
  { label: "얌전 모드", mode: "calm", message: "얌전 모드로 있을게요. 여기서 조용히 지켜볼게요." },
  { label: "활동 모드", mode: "active", message: "활동 모드예요. 마우스 근처로 따라가 볼게요." },
  { label: "집중 모드", mode: "focus", message: "집중 모드예요. 말풍선만 보여드릴게요." },
];

let rootElement = null;
let bubbleElement = null;
let avatarButton = null;
let modeMenuElement = null;
let blockerElement = null;
let currentUrl = location.href;
let lastSpeechAt = 0;
let greetingTimer = 0;
let urlPollTimer = 0;
let dismissedDangerUrl = "";
let avatarMotionFrame = 0;
let resizeListenerInstalled = false;
let pointerListenerInstalled = false;
let outsideClickListenerInstalled = false;
let pageAvatarModeBridgeInstalled = false;
let pageAvatarModeObserver = null;
let currentAvatarMode = "calm";
const avatarMotion = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  homeX: 0,
  homeY: 0,
  pointerX: 0,
  pointerY: 0,
  hasPointer: false,
  lastFrameAt: 0,
};

initializeAvatar();

function initializeAvatar() {
  createAvatarElements();
  createBlockerElement();
  applyPageAvatarModePreference();
  installPageAvatarModeBridge();
  requestSettings();
  installUrlWatcher();
  installOutsideClickListener();
  installPointerTracker();
  notifyUrlChanged();
  scheduleGreeting();
  startAvatarMotion();
}

function createAvatarElements() {
  const existingRoot = document.getElementById(ROOT_ID);
  if (existingRoot) {
    rootElement = existingRoot;
    bubbleElement = existingRoot.querySelector(".linkguard-bubble");
    avatarButton = existingRoot.querySelector(".linkguard-avatar");
    modeMenuElement = existingRoot.querySelector(".linkguard-mode-menu");
    return;
  }

  rootElement = document.createElement("aside");
  rootElement.id = ROOT_ID;
  rootElement.dataset.tone = "info";
  rootElement.setAttribute("aria-live", "polite");

  bubbleElement = document.createElement("div");
  bubbleElement.className = "linkguard-bubble";
  bubbleElement.textContent = "URL 감시 도우미가 준비됐어요.";

  avatarButton = document.createElement("button");
  avatarButton.className = "linkguard-avatar";
  avatarButton.type = "button";
  avatarButton.title = "URL 감시 도우미";
  avatarButton.setAttribute("aria-label", "URL 감시 도우미");

  const sprite = document.createElement("span");
  sprite.className = "linkguard-avatar-sprite";
  sprite.setAttribute("aria-hidden", "true");
  sprite.style.backgroundImage = `url("${getExtensionAssetUrl("assets/avatar-sprite.png")}")`;

  modeMenuElement = createModeMenuElement();
  avatarButton.append(sprite);
  rootElement.append(bubbleElement, modeMenuElement, avatarButton);
  document.documentElement.append(rootElement);

  avatarButton.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleModeMenu();
    showBubble("원하는 아바타 모드를 골라주세요.", "info", { persist: true });
  });

  bubbleElement.addEventListener("click", (event) => {
    if (currentAvatarMode !== "focus") {
      return;
    }

    event.stopPropagation();
    toggleModeMenu();
  });

  bubbleElement.addEventListener("keydown", (event) => {
    if (currentAvatarMode !== "focus" || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    toggleModeMenu();
  });
}

function createModeMenuElement() {
  const menu = document.createElement("div");
  menu.className = "linkguard-mode-menu";
  menu.setAttribute("aria-label", "아바타 모드 선택");
  menu.setAttribute("role", "menu");

  for (const option of AVATAR_MODES) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.mode = option.mode;
    button.setAttribute("role", "menuitemradio");
    button.textContent = option.label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setAvatarInteractionMode(option.mode, { persist: true });
      hideModeMenu();
      showBubble(option.message, option.mode === "focus" ? "safe" : "info", {
        persist: option.mode === "focus",
      });
    });
    menu.append(button);
  }

  menu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  return menu;
}

function createBlockerElement() {
  const existingBlocker = document.getElementById(BLOCKER_ID);
  if (existingBlocker) {
    blockerElement = existingBlocker;
    return;
  }

  blockerElement = document.createElement("section");
  blockerElement.id = BLOCKER_ID;
  blockerElement.className = "is-hidden";
  blockerElement.setAttribute("role", "dialog");
  blockerElement.setAttribute("aria-modal", "true");
  blockerElement.setAttribute("aria-labelledby", "linkguard-blocker-title");

  const panel = document.createElement("div");
  panel.className = "linkguard-blocker-panel";

  const badge = document.createElement("div");
  badge.className = "linkguard-blocker-badge";
  badge.textContent = "!";

  const title = document.createElement("h1");
  title.id = "linkguard-blocker-title";
  title.textContent = "위험한 URL 경고";

  const message = document.createElement("p");
  message.className = "linkguard-blocker-message";

  const details = document.createElement("div");
  details.className = "linkguard-blocker-details";

  const actions = document.createElement("div");
  actions.className = "linkguard-blocker-actions";

  const backButton = document.createElement("button");
  backButton.className = "linkguard-blocker-primary";
  backButton.type = "button";
  backButton.textContent = "뒤로 가기";
  backButton.addEventListener("click", goBackSafely);

  const continueButton = document.createElement("button");
  continueButton.className = "linkguard-blocker-secondary";
  continueButton.type = "button";
  continueButton.textContent = "알겠습니다, 계속하기";
  continueButton.addEventListener("click", () => {
    dismissedDangerUrl = currentUrl;
    hideDangerBlocker();
    showBubble("경고를 닫았어요. 비밀번호, 인증번호, 결제 정보는 입력하지 마세요.", "danger");
  });

  actions.append(backButton, continueButton);
  panel.append(badge, title, message, details, actions);
  blockerElement.append(panel);
  document.documentElement.append(blockerElement);
}

function requestSettings() {
  const didSend = sendRuntimeMessage({ type: "LINKGUARD_GET_SETTINGS" }, (settings) => {
    if (getRuntimeLastError()) {
      showBubble("확장 프로그램 설정을 불러오지 못했어요.", "warn");
      return;
    }

    applySettings(withPageAvatarModePreference(settings));
  });

  if (!didSend) {
    applySettings(withPageAvatarModePreference({
      avatarInteractionMode: currentAvatarMode,
      avatarModeEnabled: false,
    }));
  }
}

addRuntimeMessageListener((message) => {
  const nextSettings = message?.settings ? withPageAvatarModePreference(message.settings) : null;

  if (message?.settings) {
    applySettings(nextSettings);
  }

  if (nextSettings?.avatarModeEnabled === false || rootElement?.classList.contains("is-hidden")) {
    return;
  }

  if (message?.type === "LINKGUARD_URL_SCAN_PENDING") {
    hideDangerBlockerIfUrlChanged(message.payload?.url);
    showBubble("이 URL을 확인하고 있어요.", "info");
    return;
  }

  if (message?.type === "LINKGUARD_URL_VERDICT") {
    showVerdict(message.payload?.verdict, message.payload?.url);
    return;
  }

  if (message?.type === "LINKGUARD_URL_SCAN_ERROR") {
    showBubble(`검사에 실패했어요. ${formatScanError(message.payload?.error)}`, "warn");
  }
});

function applySettings(settings = {}) {
  if (!rootElement) {
    return;
  }

  const isHidden = settings.avatarModeEnabled === false;
  rootElement.classList.toggle("is-hidden", isHidden);

  setAvatarInteractionMode(settings.avatarInteractionMode || currentAvatarMode);

  if (isHidden) {
    hideDangerBlocker();
    hideModeMenu();
  }
}

function installPageAvatarModeBridge() {
  if (pageAvatarModeBridgeInstalled) {
    return;
  }

  window.addEventListener(PAGE_AVATAR_MODE_EVENT, (event) => {
    const enabled = event?.detail?.enabled;
    const nextEnabled = typeof enabled === "boolean" ? enabled : readPageAvatarModePreference();

    if (nextEnabled === null) {
      return;
    }

    setAvatarModeEnabled(nextEnabled, { persist: true });
  });

  if (document.documentElement && typeof MutationObserver !== "undefined") {
    pageAvatarModeObserver = new MutationObserver(() => {
      const nextEnabled = readPageAvatarModePreference();

      if (nextEnabled === null) {
        return;
      }

      setAvatarModeEnabled(nextEnabled, { persist: true });
    });
    pageAvatarModeObserver.observe(document.documentElement, {
      attributeFilter: [PAGE_AVATAR_MODE_ATTRIBUTE],
      attributes: true,
    });
  }

  pageAvatarModeBridgeInstalled = true;
}

function applyPageAvatarModePreference() {
  const enabled = readPageAvatarModePreference();

  if (enabled === null) {
    return;
  }

  applySettings({
    avatarInteractionMode: currentAvatarMode,
    avatarModeEnabled: enabled,
  });
}

function withPageAvatarModePreference(settings = {}) {
  const enabled = readPageAvatarModePreference();

  if (enabled === null) {
    return settings;
  }

  return {
    ...settings,
    avatarModeEnabled: enabled,
  };
}

function readPageAvatarModePreference() {
  const attributeValue = document.documentElement?.getAttribute(PAGE_AVATAR_MODE_ATTRIBUTE);

  if (attributeValue === "on") {
    return true;
  }

  if (attributeValue === "off") {
    return false;
  }

  try {
    const value = window.localStorage?.getItem(PAGE_AVATAR_MODE_STORAGE_KEY);

    if (value === "on") {
      return true;
    }

    if (value === "off") {
      return false;
    }
  } catch {
    return null;
  }

  return null;
}

function setAvatarModeEnabled(enabled, { persist = false } = {}) {
  applySettings({
    avatarInteractionMode: currentAvatarMode,
    avatarModeEnabled: enabled,
  });

  if (persist) {
    persistAvatarModeEnabled(enabled);
    return;
  }

  if (enabled) {
    notifyUrlChanged();
  }
}

function toggleModeMenu() {
  if (!rootElement || !modeMenuElement) {
    return;
  }

  const shouldOpen = !rootElement.classList.contains("is-menu-open");
  rootElement.classList.toggle("is-menu-open", shouldOpen);
  modeMenuElement.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
}

function hideModeMenu() {
  rootElement?.classList.remove("is-menu-open");
  modeMenuElement?.setAttribute("aria-hidden", "true");
}

function installOutsideClickListener() {
  if (outsideClickListenerInstalled) {
    return;
  }

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!rootElement?.contains(event.target)) {
        hideModeMenu();
      }
    },
    true,
  );
  outsideClickListenerInstalled = true;
}

function setAvatarInteractionMode(mode, { persist = false } = {}) {
  const normalizedMode = normalizeAvatarInteractionMode(mode);
  currentAvatarMode = normalizedMode;

  if (rootElement) {
    rootElement.dataset.interactionMode = normalizedMode;
    rootElement.classList.toggle("is-focus-mode", normalizedMode === "focus");
  }

  updateModeMenuState();
  updateBubbleInteractivity();

  if (normalizedMode === "calm") {
    returnAvatarHome();
    setAvatarMotion("walk-front");
  }

  if (normalizedMode === "focus") {
    setAvatarMotion("idle");
    showBubble(bubbleElement?.textContent || "URL 감시 도우미가 준비됐어요.", "info", { persist: true });
  }

  if (persist) {
    persistAvatarInteractionMode(normalizedMode);
  }
}

function updateModeMenuState() {
  if (!modeMenuElement) {
    return;
  }

  for (const button of modeMenuElement.querySelectorAll("button[data-mode]")) {
    const isSelected = button.dataset.mode === currentAvatarMode;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-checked", String(isSelected));
  }
}

function updateBubbleInteractivity() {
  if (!bubbleElement) {
    return;
  }

  if (currentAvatarMode === "focus") {
    bubbleElement.setAttribute("role", "button");
    bubbleElement.setAttribute("tabindex", "0");
    bubbleElement.setAttribute("title", "아바타 모드 선택");
    return;
  }

  bubbleElement.removeAttribute("role");
  bubbleElement.removeAttribute("tabindex");
  bubbleElement.removeAttribute("title");
}

function persistAvatarInteractionMode(mode) {
  sendRuntimeMessage(
    {
      settings: { avatarInteractionMode: mode },
      type: "LINKGUARD_SET_SETTINGS",
    },
    (settings) => {
      if (getRuntimeLastError()) {
        showBubble("아바타 모드를 저장하지 못했어요.", "warn");
        return;
      }

      applySettings(withPageAvatarModePreference(settings));
    },
  );
}

function persistAvatarModeEnabled(enabled) {
  const didSend = sendRuntimeMessage(
    {
      settings: { avatarModeEnabled: enabled },
      type: "LINKGUARD_SET_SETTINGS",
    },
    (settings) => {
      if (getRuntimeLastError()) {
        if (enabled) {
          showBubble("아바타 모드를 저장하지 못했어요.", "warn");
        }
        return;
      }

      applySettings(withPageAvatarModePreference(settings));
      if (enabled) {
        notifyUrlChanged();
      }
    },
  );

  if (!didSend && enabled) {
    notifyUrlChanged();
  }
}

function normalizeAvatarInteractionMode(mode) {
  return AVATAR_MODES.some((option) => option.mode === mode) ? mode : "calm";
}

function startAvatarMotion() {
  if (!rootElement) {
    return;
  }

  const bounds = getAvatarMotionBounds();
  avatarMotion.homeX = clamp(window.innerWidth - AVATAR_WIDTH - 22, bounds.minX, bounds.maxX);
  avatarMotion.homeY = bounds.maxY;
  avatarMotion.x = avatarMotion.homeX;
  avatarMotion.y = avatarMotion.homeY;
  avatarMotion.targetX = avatarMotion.x;
  avatarMotion.targetY = avatarMotion.y;
  avatarMotion.lastFrameAt = 0;

  setAvatarInteractionMode(currentAvatarMode);
  setAvatarPosition(avatarMotion.x, avatarMotion.y);

  if (!resizeListenerInstalled) {
    window.addEventListener("resize", keepAvatarInViewport, { passive: true });
    resizeListenerInstalled = true;
  }

  window.cancelAnimationFrame(avatarMotionFrame);
  avatarMotionFrame = window.requestAnimationFrame(stepAvatarMotion);
}

function stepAvatarMotion(now) {
  if (!rootElement) {
    return;
  }

  if (rootElement.classList.contains("is-hidden") || currentAvatarMode === "focus" || shouldReduceAvatarMotion()) {
    setAvatarMotion("idle");
    avatarMotion.lastFrameAt = now;
    avatarMotionFrame = window.requestAnimationFrame(stepAvatarMotion);
    return;
  }

  if (!avatarMotion.lastFrameAt) {
    avatarMotion.lastFrameAt = now;
  }

  const elapsedSeconds = Math.min(0.08, (now - avatarMotion.lastFrameAt) / 1000);
  avatarMotion.lastFrameAt = now;

  if (currentAvatarMode === "calm") {
    setAvatarMotion("walk-front");
    setAvatarPosition(avatarMotion.homeX, avatarMotion.homeY);
    avatarMotionFrame = window.requestAnimationFrame(stepAvatarMotion);
    return;
  }

  updateActiveTarget();
  const dx = avatarMotion.targetX - avatarMotion.x;
  const dy = avatarMotion.targetY - avatarMotion.y;
  const distance = Math.hypot(dx, dy);
  const step = AVATAR_ACTIVE_SPEED * elapsedSeconds;

  if (distance <= step || distance < 1) {
    setAvatarPosition(avatarMotion.targetX, avatarMotion.targetY);
    setAvatarMotion("walk-front");
    avatarMotionFrame = window.requestAnimationFrame(stepAvatarMotion);
    return;
  }

  setAvatarPosition(
    avatarMotion.x + (dx / distance) * step,
    avatarMotion.y + (dy / distance) * step,
  );
  setAvatarMotion(getWalkingMotion(dx, dy));
  avatarMotionFrame = window.requestAnimationFrame(stepAvatarMotion);
}

function installPointerTracker() {
  if (pointerListenerInstalled) {
    return;
  }

  window.addEventListener("pointermove", trackPointer, { capture: true, passive: true });
  document.addEventListener("pointermove", trackPointer, { capture: true, passive: true });
  pointerListenerInstalled = true;
}

function trackPointer(event) {
  avatarMotion.pointerX = event.clientX;
  avatarMotion.pointerY = event.clientY;
  avatarMotion.hasPointer = true;
}

function updateActiveTarget() {
  const bounds = getAvatarMotionBounds("active");

  if (!avatarMotion.hasPointer) {
    avatarMotion.targetX = avatarMotion.homeX;
    avatarMotion.targetY = avatarMotion.homeY;
    return;
  }

  const horizontalOffset = avatarMotion.pointerX > window.innerWidth - 130 ? -92 : 22;
  avatarMotion.targetX = clamp(avatarMotion.pointerX + horizontalOffset, bounds.minX, bounds.maxX);
  avatarMotion.targetY = clamp(avatarMotion.pointerY - AVATAR_HEIGHT + 30, bounds.minY, bounds.maxY);
}

function returnAvatarHome() {
  const bounds = getAvatarMotionBounds();
  avatarMotion.homeX = clamp(window.innerWidth - AVATAR_WIDTH - 22, bounds.minX, bounds.maxX);
  avatarMotion.homeY = bounds.maxY;
  setAvatarPosition(avatarMotion.homeX, avatarMotion.homeY);
}

function getWalkingMotion(dx, dy) {
  if (Math.abs(dy) > Math.abs(dx) * 1.2) {
    return "walk-front";
  }

  return dx < 0 ? "walk-left" : "walk-right";
}

function getExtensionAssetUrl(assetPath) {
  const runtime = getRuntime();

  if (runtime?.getURL) {
    try {
      return runtime.getURL(assetPath);
    } catch {
      return assetPath;
    }
  }

  return assetPath;
}

function getRuntime() {
  try {
    if (typeof chrome === "undefined" || !chrome.runtime) {
      return null;
    }

    return chrome.runtime;
  } catch {
    return null;
  }
}

function getRuntimeLastError() {
  try {
    return getRuntime()?.lastError || null;
  } catch {
    return null;
  }
}

function sendRuntimeMessage(message, callback) {
  const runtime = getRuntime();

  if (!runtime?.sendMessage) {
    return false;
  }

  try {
    runtime.sendMessage(message, callback);
    return true;
  } catch {
    return false;
  }
}

function addRuntimeMessageListener(listener) {
  const runtime = getRuntime();

  if (!runtime?.onMessage?.addListener) {
    return false;
  }

  try {
    runtime.onMessage.addListener(listener);
    return true;
  } catch {
    return false;
  }
}

function setAvatarPosition(x, y) {
  if (!rootElement) {
    return;
  }

  const bounds = getAvatarMotionBounds(currentAvatarMode === "active" ? "active" : "floor");
  avatarMotion.x = clamp(x, bounds.minX, bounds.maxX);
  avatarMotion.y = clamp(y, bounds.minY, bounds.maxY);
  rootElement.style.setProperty("--linkguard-helper-x", `${Math.round(avatarMotion.x)}px`);
  rootElement.style.setProperty("--linkguard-helper-y", `${Math.round(avatarMotion.y)}px`);
  rootElement.classList.toggle("is-near-left", avatarMotion.x < 280);
}

function setAvatarMotion(motion) {
  if (rootElement?.dataset.motion !== motion) {
    rootElement.dataset.motion = motion;
  }
}

function keepAvatarInViewport() {
  if (currentAvatarMode === "calm") {
    returnAvatarHome();
    return;
  }

  setAvatarPosition(avatarMotion.x, avatarMotion.y);
  updateActiveTarget();
}

function getAvatarMotionBounds(mode = "floor") {
  const viewportWidth = Math.max(window.innerWidth || 0, AVATAR_WIDTH + AVATAR_MARGIN * 2);
  const viewportHeight = Math.max(window.innerHeight || 0, AVATAR_HEIGHT + AVATAR_MARGIN * 2);
  const maxX = Math.max(AVATAR_MARGIN, viewportWidth - AVATAR_WIDTH - AVATAR_MARGIN);
  const maxY = Math.max(AVATAR_MARGIN, viewportHeight - AVATAR_HEIGHT - AVATAR_MARGIN);
  const minY = mode === "active" ? AVATAR_MARGIN : Math.max(AVATAR_MARGIN, maxY - 74);

  return {
    minX: AVATAR_MARGIN,
    maxX,
    minY,
    maxY,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shouldReduceAvatarMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function showVerdict(verdict, inspectedUrl) {
  const tone = normalizeTone(verdict);
  const host = getHost(inspectedUrl);
  const score = Number(verdict?.score);
  const scoreText = Number.isFinite(score) ? ` 위험 점수 ${score}점.` : "";

  if (tone === "danger") {
    showBubble(`${host}은(는) 위험해 보입니다.${scoreText} 개인정보를 입력하기 전에 멈춰주세요.`, "danger");
    if (dismissedDangerUrl !== inspectedUrl) {
      showDangerBlocker({ host, inspectedUrl, score, verdict });
    }
    return;
  }

  hideDangerBlocker();

  if (tone === "warn") {
    showBubble(`${host}은(는) 주의가 필요해요.${scoreText} 주소와 공식 채널을 다시 확인하세요.`, "warn");
    return;
  }

  showBubble(`${host}에서는 지금 강한 위험 신호가 보이지 않아요.${scoreText}`, "safe");
}

function showDangerBlocker({ host, inspectedUrl, score, verdict }) {
  if (!blockerElement) {
    return;
  }

  const scoreText = Number.isFinite(score) ? `위험 점수: ${score}점` : "위험 점수: 높음";
  const statusText = formatStatusText(verdict?.statusLabel || verdict?.caption || verdict?.verdict || "danger");
  const message = blockerElement.querySelector(".linkguard-blocker-message");
  const details = blockerElement.querySelector(".linkguard-blocker-details");

  message.textContent = `${host} 페이지가 위험할 수 있는 곳으로 표시됐어요. 여기에는 비밀번호, 인증번호, 카드 번호, 개인정보를 입력하지 마세요.`;
  details.textContent = `${scoreText} | 상태: ${statusText} | URL: ${inspectedUrl}`;
  blockerElement.classList.remove("is-hidden");
  blockerElement.classList.add("is-visible");
}

function hideDangerBlocker() {
  if (!blockerElement) {
    return;
  }

  blockerElement.classList.add("is-hidden");
  blockerElement.classList.remove("is-visible");
}

function hideDangerBlockerIfUrlChanged(nextUrl) {
  if (nextUrl && nextUrl !== currentUrl) {
    hideDangerBlocker();
  }
}

function goBackSafely() {
  hideDangerBlocker();

  if (history.length > 1) {
    history.back();
    return;
  }

  location.href = "about:blank";
}

function showBubble(message, tone = "info", { persist = false } = {}) {
  if (!rootElement || !bubbleElement) {
    return;
  }

  lastSpeechAt = Date.now();
  rootElement.dataset.tone = tone;
  bubbleElement.textContent = message;
  rootElement.classList.add("is-speaking");

  window.clearTimeout(showBubble.timeoutId);
  if (persist) {
    return;
  }

  showBubble.timeoutId = window.setTimeout(() => {
    rootElement?.classList.remove("is-speaking");
  }, 7600);
}

function installUrlWatcher() {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    window.dispatchEvent(new Event("linkguard-location-change"));
    return result;
  };

  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    window.dispatchEvent(new Event("linkguard-location-change"));
    return result;
  };

  window.addEventListener("popstate", notifyUrlChanged);
  window.addEventListener("hashchange", notifyUrlChanged);
  window.addEventListener("linkguard-location-change", notifyUrlChanged);

  window.clearInterval(urlPollTimer);
  urlPollTimer = window.setInterval(() => {
    if (currentUrl !== location.href) {
      notifyUrlChanged();
    }
  }, 1200);
}

function notifyUrlChanged() {
  const previousUrl = currentUrl;
  currentUrl = location.href;

  if (previousUrl !== currentUrl) {
    hideDangerBlocker();
  }

  sendRuntimeMessage({
    type: "LINKGUARD_PAGE_URL_CHANGED",
    url: currentUrl,
  });
}

function scheduleGreeting() {
  window.clearInterval(greetingTimer);
  greetingTimer = window.setInterval(() => {
    if (!rootElement || rootElement.classList.contains("is-hidden")) {
      return;
    }

    if (Date.now() - lastSpeechAt < 45000) {
      return;
    }

    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    showBubble(greeting, "info");
  }, 70000);
}

function normalizeTone(verdict) {
  const score = Number(verdict?.score);

  if (verdict?.tone === "danger" || verdict?.verdict === "malicious" || score >= 80) {
    return "danger";
  }

  if (verdict?.tone === "warn" || verdict?.verdict === "suspicious" || score >= 45) {
    return "warn";
  }

  return "safe";
}

function getHost(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "이 페이지";
  }
}

function formatStatusText(value) {
  const text = String(value || "").trim();
  const normalized = text.toLowerCase().replace(/[\s_-]+/g, "_");

  if (!text) {
    return "위험";
  }

  if (/[가-힣]/.test(text)) {
    return text;
  }

  if (normalized.includes("malicious") || normalized.includes("danger") || normalized.includes("high_risk")) {
    return "위험";
  }

  if (normalized.includes("suspicious") || normalized.includes("warn") || normalized.includes("caution")) {
    return "주의";
  }

  if (normalized.includes("safe") || normalized.includes("clean") || normalized.includes("ok")) {
    return "안전";
  }

  return "확인 필요";
}

function formatScanError(value) {
  const text = String(value || "").trim();
  const normalized = text.toLowerCase();

  if (!text) {
    return "잠시 후 다시 시도해주세요.";
  }

  if (/[가-힣]/.test(text)) {
    return text;
  }

  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return "요청 시간이 초과됐어요.";
  }

  if (normalized.includes("invalid json")) {
    return "API 응답을 읽지 못했어요.";
  }

  if (normalized.includes("could not connect") || normalized.includes("failed to fetch")) {
    return "LinkGuard API에 연결하지 못했어요.";
  }

  if (normalized.includes("response error")) {
    return "LinkGuard API가 오류 응답을 보냈어요.";
  }

  return "잠시 후 다시 시도해주세요.";
}
