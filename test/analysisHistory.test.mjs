import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import {
  buildAnalysisHistoryReportHtml,
  deleteAnalysisHistoryEntries,
  loadAnalysisHistory,
  saveAnalysisHistoryEntry,
} from "../src/lib/analysisHistory.js";
import { analyzeUrl } from "../src/lib/linkRiskAnalyzer.js";

const STORAGE_KEY = "linkguard:analysis-history";

beforeEach(() => {
  globalThis.CustomEvent = class CustomEvent {
    constructor(type) {
      this.type = type;
    }
  };
  globalThis.window = {
    addEventListener() {},
    dispatchEvent() {},
    localStorage: createMemoryStorage(),
    removeEventListener() {},
  };
});

afterEach(() => {
  delete globalThis.CustomEvent;
  delete globalThis.window;
});

test("saves valid analysis history entries and deduplicates by URL without hash", () => {
  const first = analyzeUrl("https://example.com/login#first");
  const second = analyzeUrl("https://example.com/login#second");

  saveAnalysisHistoryEntry(first, { mode: "normal", requestedUrl: "https://example.com/login#first" });
  saveAnalysisHistoryEntry(second, { mode: "expert", requestedUrl: "https://example.com/login#second" });

  const rows = loadAnalysisHistory();

  assert.equal(rows.length, 1);
  assert.equal(rows[0].mode, "expert");
  assert.equal(rows[0].displayHost, "example.com");
  assert.equal(rows[0].url, "https://example.com/login#second");
  assert.equal(rows[0].analysisSnapshot.displayHost, "example.com");
});

test("ignores invalid analyses and corrupted localStorage payloads", () => {
  const invalid = analyzeUrl("not a url");

  assert.equal(saveAnalysisHistoryEntry(invalid), null);
  assert.deepEqual(loadAnalysisHistory(), []);

  window.localStorage.setItem(STORAGE_KEY, "{bad json");

  assert.deepEqual(loadAnalysisHistory(), []);
});

test("deletes selected analysis history entries by id", () => {
  const first = saveAnalysisHistoryEntry(analyzeUrl("https://example.com/login"), {
    requestedUrl: "https://example.com/login",
  });
  saveAnalysisHistoryEntry(analyzeUrl("https://danger-paypal-login.xyz/verify"), {
    requestedUrl: "https://danger-paypal-login.xyz/verify",
  });

  const rows = deleteAnalysisHistoryEntries([first.id]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].displayHost, "danger-paypal-login.xyz");
});

test("analysis history report renders security diagnosis sections", () => {
  const row = saveAnalysisHistoryEntry(analyzeUrl("https://danger-paypal-login.xyz/verify"), {
    requestedUrl: "https://danger-paypal-login.xyz/verify",
  });
  const html = buildAnalysisHistoryReportHtml([row]);

  assert.match(html, /LinkGuard AI 보안 진단 보고서/);
  assert.match(html, /AI 최종 판단 요약/);
  assert.match(html, /위험 점수 상세 분해/);
  assert.match(html, /URL 기본 정보/);
  assert.match(html, /탐지된 위험 신호/);
  assert.match(html, /외부 평판 조회 결과/);
  assert.match(html, /사용자 행동 가이드/);
  assert.match(html, /모든 악성 URL을 100% 탐지/);
});

function createMemoryStorage() {
  const entries = new Map();

  return {
    clear() {
      entries.clear();
    },
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    removeItem(key) {
      entries.delete(key);
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
  };
}
