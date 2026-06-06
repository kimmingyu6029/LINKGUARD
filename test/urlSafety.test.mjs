import assert from "node:assert/strict";
import test from "node:test";
import { analyzeUrl } from "../src/lib/linkRiskAnalyzer.js";
import { composeUrlVerdict } from "../src/lib/urlVerdictComposer.js";

test("blocks private network URLs before any remote analysis", () => {
  const result = analyzeUrl("http://127.0.0.1/admin");

  assert.equal(result.verdict, "blocked");
  assert.equal(result.safetyCheck.safe, false);
  assert.ok(result.evidence.some((item) => item.label === "SSRF safety block"));
});

test("forces high risk when webpage content combines password input and brand mismatch", () => {
  const analysis = analyzeUrl("https://kakao-login-auth.example/login");
  const result = composeUrlVerdict({
    analysis,
    contentResult: {
      brandDomainMismatch: true,
      brandKeywords: ["kakao"],
      detail: "Content analysis found page-level risk signals.",
      downloadLinks: [],
      evidence: [{ detail: "Password input outside official kakao.com.", label: "Brand/domain mismatch", points: 35 }],
      externalScriptCount: 0,
      finalUrl: "https://kakao-login-auth.example/login",
      formActions: [],
      hasLoginForm: true,
      hasPasswordInput: true,
      score: 90,
      sensitivePrompts: ["password"],
      status: "complete",
      suspiciousJsPatterns: [],
      title: "Kakao login",
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
  assert.ok(result.score >= 75);
  assert.equal(result.componentScores.content, 90);
});

test("treats official ChatGPT share IDs and content fetch failures as analysis limits, not risk evidence", () => {
  const analysis = analyzeUrl("https://chatgpt.com/c/6a19c78e-f6d4-83a4-9e73-c2b98975c96c");
  const result = composeUrlVerdict({
    analysis,
    contentResult: {
      detail: "웹페이지 콘텐츠 요청이 HTTP 403로 실패했습니다.",
      evidence: [],
      finalUrl: analysis.displayUrl,
      hasLoginForm: false,
      hasPasswordInput: false,
      score: 20,
      status: "error",
    },
    reputation: {
      detail: "No provider match.",
      label: "Clean",
      provider: "TestReputation",
      status: "clean",
      tone: "safe",
    },
  });

  assert.equal(analysis.verdict, "safe");
  assert.equal(result.componentScores.content, 0);
  assert.ok(!result.synthesisReasons.some((reason) => reason.includes("HTTP 403")));
  assert.ok(!result.synthesisReasons.some((reason) => reason.includes("무작위 코드")));
});
