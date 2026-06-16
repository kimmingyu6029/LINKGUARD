import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("analysis page shows a prominent progress panel while reputation checks run", () => {
  const source = readFileSync(resolve("src/pages/AnalysisPage.jsx"), "utf8");

  assert.match(source, /isCheckingReputation\s*\?\s*\(\s*<AnalysisProgressPanel/);
  assert.match(source, /function AnalysisProgressPanel/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /분석 진행 중/);
  assert.match(source, /보통 3~8초/);
  assert.match(source, /평판 DB 확인 중/);
  assert.match(source, /리다이렉트 추적/);
  assert.match(source, /최종 판정 준비/);
});

test("analysis progress panel has large visible loading treatment", () => {
  const styleSource = readFileSync(resolve("src/styles/global.css"), "utf8");

  assert.match(styleSource, /\.analysis-progress-panel/);
  assert.match(styleSource, /grid-template-columns:\s*minmax\(0,\s*0\.92fr\)\s*minmax\(360px,\s*1\.08fr\)/);
  assert.match(styleSource, /\.analysis-progress-spinner/);
  assert.match(styleSource, /width:\s*64px/);
  assert.match(styleSource, /\.analysis-progress-steps/);
  assert.match(styleSource, /@keyframes analysis-progress-sweep/);
  assert.match(styleSource, /@keyframes analysis-step-pulse/);
});
