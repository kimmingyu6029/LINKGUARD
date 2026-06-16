import assert from "node:assert/strict";
import test from "node:test";
import { analyzeUrl } from "../src/lib/linkRiskAnalyzer.js";
import { composeUrlVerdict } from "../src/lib/urlVerdictComposer.js";

test("composeUrlVerdict applies reputation matches as confirmed malicious verdicts", () => {
  const analysis = analyzeUrl("https://plain-example.test/login");
  const result = composeUrlVerdict({
    analysis,
    reputation: {
      detail: "Matched a known phishing URL.",
      label: "Threat match",
      provider: "TestReputation",
      status: "match",
      tone: "danger",
    },
  });

  assert.equal(result.reputation.provider, "TestReputation");
  assert.equal(result.verdict, "malicious");
  assert.equal(result.score, 100);
  assert.equal(result.signals[0].key, "reputation");
});

test("composeUrlVerdict does not treat weak stale VirusTotal single-engine detections as confirmed malicious", () => {
  const analysis = analyzeUrl("https://www.youtube.com/watch?v=9Qc7xonwpQs");
  const result = composeUrlVerdict({
    analysis,
    reputation: {
      ageDays: 2327,
      detail: "VirusTotal에서 72개 엔진 중 1개가 이 URL을 악성으로, 0개가 의심으로 분류했습니다.",
      engines: [{ category: "malicious", engineName: "Quttera", result: "malicious" }],
      label: "VirusTotal 위협 탐지",
      matches: [{ harmless: 64, malicious: 1, suspicious: 0, total: 72, undetected: 7 }],
      provider: "VirusTotal",
      scanDate: "2020. 1. 31.",
      status: "match",
      stats: { harmless: 64, malicious: 1, suspicious: 0, timeout: 0, total: 72, undetected: 7 },
      tone: "danger",
    },
  });

  assert.equal(result.reputation.status, "suspicious");
  assert.equal(result.reputation.severity, "low");
  assert.notEqual(result.verdict, "malicious");
  assert.ok(result.score < 41);
  assert.ok(result.synthesisReasons.some((reason) => /단일 엔진|낮은 비율/.test(reason)));
});

test("composeUrlVerdict keeps AI judgments as a low-weight input after clean reputation", () => {
  const analysis = analyzeUrl("https://login-security-example.test/account");
  const result = composeUrlVerdict({
    aiRisk: {
      confidence: 0.82,
      recommendedAction: "Verify the site from an official source.",
      riskReasons: ["Login lure on an unofficial host."],
      status: "suspicious",
      tone: "warn",
      verdict: "suspicious",
    },
    analysis,
    reputation: {
      detail: "No provider match.",
      label: "Clean",
      provider: "TestReputation",
      status: "clean",
      tone: "safe",
    },
  });

  assert.equal(result.aiRisk.status, "suspicious");
  assert.equal(result.verdictLabel, "SAFE");
  assert.equal(result.componentScores.ai, 53);
  assert.equal(result.score, 13);
  assert.equal(result.signals[0].key, "aiRisk");
});

test("composeUrlVerdict keeps unreviewed community reports as a low-weight signal", () => {
  const analysis = analyzeUrl("https://plain-example.test/login");
  const result = composeUrlVerdict({
    analysis,
    communityReport: {
      confidenceScore: 70,
      hasReports: true,
      lastReportedAt: "2026-05-30T00:00:00.000Z",
      primaryReportType: "phishing",
      reportCount: 8,
      score: 72,
      status: "pending",
      uniqueReporters: 6,
    },
    reputation: {
      detail: "No provider match.",
      label: "Clean",
      provider: "TestReputation",
      status: "clean",
      tone: "safe",
    },
  });

  assert.equal(result.componentScores.community, 72);
  assert.equal(result.verdictLabel, "SAFE");
  assert.equal(result.score, 9);
  assert.equal(result.signals[0].key, "community");
});

test("composeUrlVerdict does not force high risk for login forms on official clean domains", () => {
  const analysis = analyzeUrl("https://www.google.com/");
  const result = composeUrlVerdict({
    analysis,
    contentResult: {
      brandDomainMismatch: false,
      brandKeywords: ["google"],
      detail: "Content analysis found page-level risk signals.",
      evidence: [
        {
          detail: "The page appears to ask the visitor to sign in.",
          label: "Login form detected",
          points: 20,
        },
      ],
      hasLoginForm: true,
      hasPasswordInput: false,
      score: 20,
      status: "complete",
    },
    reputation: {
      detail: "No provider match.",
      label: "Clean",
      provider: "TestReputation",
      status: "clean",
      tone: "safe",
    },
  });

  assert.equal(result.verdictLabel, "SAFE");
  assert.equal(result.score, 5);
  assert.ok(!result.synthesisReasons.some((reason) => /short|단축/i.test(reason)));
});

test("composeUrlVerdict still forces high risk when a shortener lands on a login page", () => {
  const analysis = analyzeUrl("https://bit.ly/example-login");
  const result = composeUrlVerdict({
    analysis,
    contentResult: {
      brandDomainMismatch: false,
      detail: "Content analysis found page-level risk signals.",
      evidence: [
        {
          detail: "The page appears to ask the visitor to sign in.",
          label: "Login form detected",
          points: 20,
        },
      ],
      hasLoginForm: true,
      hasPasswordInput: false,
      score: 20,
      status: "complete",
    },
    reputation: {
      detail: "No provider match.",
      label: "Clean",
      provider: "TestReputation",
      status: "clean",
      tone: "safe",
    },
  });

  assert.equal(result.verdictLabel, "HIGH_RISK");
  assert.equal(result.score, 65);
});

test("composeUrlVerdict strongly reflects admin-confirmed malicious reports", () => {
  const analysis = analyzeUrl("https://plain-example.test/login");
  const result = composeUrlVerdict({
    analysis,
    communityReport: {
      confidenceScore: 100,
      hasReports: true,
      lastReportedAt: "2026-05-30T00:00:00.000Z",
      primaryReportType: "phishing",
      reportCount: 2,
      score: 100,
      status: "confirmed_malicious",
      uniqueReporters: 2,
    },
    reputation: {
      detail: "No provider match.",
      label: "Clean",
      provider: "TestReputation",
      status: "clean",
      tone: "safe",
    },
  });

  assert.equal(result.componentScores.community, 100);
  assert.equal(result.verdictLabel, "MALICIOUS");
  assert.equal(result.score, 85);
});
