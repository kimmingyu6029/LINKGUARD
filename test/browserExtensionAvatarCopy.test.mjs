import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const avatarSource = readFileSync(resolve("browser-extension/content/avatar.js"), "utf8");
const avatarStyleSource = readFileSync(resolve("browser-extension/content/avatar.css"), "utf8");
const appShellSource = readFileSync(resolve("src/components/AppShell.jsx"), "utf8");
const backgroundSource = readFileSync(resolve("browser-extension/background.js"), "utf8");
const globalStyleSource = readFileSync(resolve("src/styles/global.css"), "utf8");
const manifestSource = readFileSync(resolve("browser-extension/manifest.json"), "utf8");

test("browser extension avatar speaks Korean in user-facing copy", () => {
  const disallowedEnglishCopy = [
    "I am quietly watching URLs for you.",
    "New links deserve a quick safety check.",
    "I will scan each new page as it opens.",
    "Safer browsing, one URL at a time.",
    "URL Watch Helper is ready.",
    "I will automatically check the risk level when a new website opens.",
    "Dangerous URL warning",
    "Go back",
    "I understand, continue",
    "Warning dismissed.",
    "Could not load extension settings.",
    "Checking this URL now.",
    "Scan failed.",
    "Risk score",
    "looks dangerous",
    "needs caution",
    "has no strong danger signal",
    "this page",
  ];

  for (const phrase of disallowedEnglishCopy) {
    assert.equal(avatarSource.includes(phrase), false, `${phrase} should be translated`);
  }

  assert.match(avatarSource, /원하는 아바타 모드를 골라주세요/);
  assert.match(avatarSource, /URL 감시 도우미/);
});

test("browser extension avatar uses the supplied walking sprite frames", () => {
  const sprite = readFileSync(resolve("browser-extension/assets/avatar-sprite.png"));

  assert.equal(sprite.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(sprite.readUInt32BE(16), 640);
  assert.equal(sprite.readUInt32BE(20), 448);
  assert.match(avatarSource, /linkguard-avatar-sprite/);
  assert.match(avatarSource, /startAvatarMotion/);
  assert.match(avatarSource, /getExtensionAssetUrl/);
  assert.match(avatarSource, /const runtime = getRuntime\(\)/);
  assert.match(avatarSource, /runtime\?\.getURL/);
  assert.match(avatarSource, /walk-left/);
  assert.match(avatarSource, /walk-right/);
  assert.doesNotMatch(avatarStyleSource, /url\(["']?\.\.\/assets\/avatar-sprite\.png/);
  assert.match(avatarStyleSource, /linkguard-avatar-walk-left/);
  assert.match(avatarStyleSource, /linkguard-avatar-walk-right/);
  assert.match(avatarStyleSource, /linkguard-avatar-walk-front/);
  assert.match(manifestSource, /assets\/avatar-sprite\.png/);
});

test("browser extension avatar exposes calm active and focus interaction modes", () => {
  assert.match(backgroundSource, /avatarInteractionMode:\s*"calm"/);
  assert.match(backgroundSource, /normalizeAvatarInteractionMode/);
  assert.match(avatarSource, /얌전 모드/);
  assert.match(avatarSource, /활동 모드/);
  assert.match(avatarSource, /집중 모드/);
  assert.match(avatarSource, /pointermove/);
  assert.match(avatarSource, /capture:\s*true/);
  assert.match(avatarSource, /getAvatarMotionBounds\("active"\)/);
  assert.match(avatarSource, /mode === "active" \? AVATAR_MARGIN/);
  assert.match(avatarSource, /setAvatarInteractionMode/);
  assert.match(avatarSource, /currentAvatarMode === "focus"/);
  assert.match(avatarStyleSource, /is-focus-mode/);
  assert.match(avatarStyleSource, /linkguard-mode-menu/);
});

test("browser extension avatar stays hidden until avatar mode is enabled", () => {
  assert.match(backgroundSource, /avatarModeEnabled:\s*false/);
  assert.match(appShellSource, /dataset\.linkguardAvatarMode/);
  assert.match(globalStyleSource, /data-linkguard-avatar-mode="off"/);
  assert.match(avatarSource, /PAGE_AVATAR_MODE_ATTRIBUTE/);
  assert.match(avatarSource, /MutationObserver/);
  assert.match(avatarSource, /linkguard-avatar-mode/);
  assert.match(avatarSource, /linkguard-avatar-mode-change/);
  assert.match(avatarSource, /readPageAvatarModePreference/);
  assert.match(avatarSource, /persistAvatarModeEnabled/);
});

test("browser extension avatar guards missing runtime messaging APIs", () => {
  assert.match(avatarSource, /function getRuntime\(\)/);
  assert.match(avatarSource, /function sendRuntimeMessage/);
  assert.match(avatarSource, /function addRuntimeMessageListener/);
  assert.doesNotMatch(avatarSource, /chrome\.runtime\.sendMessage/);
  assert.doesNotMatch(avatarSource, /chrome\.runtime\.onMessage\.addListener/);
  assert.doesNotMatch(avatarSource, /chrome\.runtime\.lastError/);
});
