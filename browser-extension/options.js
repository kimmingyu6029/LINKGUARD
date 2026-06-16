const DEFAULT_SETTINGS = {
  apiBaseUrl: "http://127.0.0.1:5173",
  avatarModeEnabled: false,
  mode: "normal",
};

const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const avatarModeInput = document.getElementById("avatarModeEnabled");
const modeSelect = document.getElementById("mode");
const saveButton = document.getElementById("save");
const testApiButton = document.getElementById("testApi");
const statusElement = document.getElementById("status");

loadSettings();

saveButton.addEventListener("click", async () => {
  setStatus("저장 중이에요...");
  saveButton.disabled = true;

  try {
    const settings = readSettingsFromForm();
    const savedSettings = await chrome.runtime.sendMessage({
      settings,
      type: "LINKGUARD_SET_SETTINGS",
    });

    renderSettings(savedSettings || settings);
    setStatus("저장됐어요.");
  } catch (error) {
    setStatus(error.message || "저장에 실패했어요.", true);
  } finally {
    saveButton.disabled = false;
    clearStatusSoon();
  }
});

testApiButton.addEventListener("click", async () => {
  setStatus("LinkGuard API에 연결하고 있어요...");
  testApiButton.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      settings: readSettingsFromForm(),
      type: "LINKGUARD_TEST_API_CONNECTION",
    });

    if (!response?.ok) {
      throw new Error(response?.error || "API 연결 테스트에 실패했어요.");
    }

    const verdict = response.verdictSummary?.verdict || "ok";
    const score = Number(response.verdictSummary?.score);
    const scoreText = Number.isFinite(score) ? `, 테스트 위험도 ${score}점` : "";
    setStatus(`API 연결 성공: ${verdict}${scoreText}`);
  } catch (error) {
    setStatus(error.message || "API 연결 테스트에 실패했어요.", true);
  } finally {
    testApiButton.disabled = false;
  }
});

async function loadSettings() {
  const settings = await chrome.runtime.sendMessage({
    type: "LINKGUARD_GET_SETTINGS",
  });

  renderSettings(settings || DEFAULT_SETTINGS);
}

function readSettingsFromForm() {
  return {
    apiBaseUrl: normalizeApiBaseUrl(apiBaseUrlInput.value) || DEFAULT_SETTINGS.apiBaseUrl,
    avatarModeEnabled: avatarModeInput.checked,
    mode: modeSelect.value === "expert" ? "expert" : "normal",
  };
}

function renderSettings(settings) {
  apiBaseUrlInput.value = settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl;
  avatarModeInput.checked = settings.avatarModeEnabled !== false;
  modeSelect.value = settings.mode === "expert" ? "expert" : "normal";
}

function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", isError);
}

function clearStatusSoon() {
  window.setTimeout(() => {
    statusElement.textContent = "";
    statusElement.classList.remove("is-error");
  }, 2400);
}

function normalizeApiBaseUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.origin;
  } catch {
    return "";
  }
}
