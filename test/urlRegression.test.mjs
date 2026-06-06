import assert from "node:assert/strict";
import test from "node:test";
import { analyzeUrl } from "../src/lib/linkRiskAnalyzer.js";
import { benignUrlCases, riskyUrlCases } from "../testdata/urlRegressionCases.mjs";

const verdictRank = {
  invalid: -1,
  idle: -1,
  safe: 0,
  suspicious: 1,
  malicious: 2,
};

test("URL regression set protects against false positives on benign URLs", () => {
  const failures = [];

  for (const urlCase of benignUrlCases) {
    const result = analyzeUrl(urlCase.url, { mode: "expert" });

    if (result.verdict === "malicious") {
      failures.push(formatFailure(urlCase, result, "expected a non-malicious verdict"));
    }
  }

  assert.deepEqual(failures, []);
});

test("URL regression set protects against false negatives on risky URLs", () => {
  const failures = [];

  for (const urlCase of riskyUrlCases) {
    const result = analyzeUrl(urlCase.url, { mode: "expert" });
    const actualRank = verdictRank[result.verdict] ?? -1;
    const expectedRank = verdictRank[urlCase.minimumVerdict] ?? 0;

    if (actualRank < expectedRank) {
      failures.push(formatFailure(urlCase, result, `expected at least ${urlCase.minimumVerdict}`));
    }
  }

  assert.deepEqual(failures, []);
});

function formatFailure(urlCase, result, expectation) {
  const evidence = result.evidence
    .map((item) => `${item.points}:${item.label}`)
    .join(", ");

  return {
    actual: result.verdict,
    evidence,
    expectation,
    id: urlCase.id,
    reason: urlCase.reason,
    score: result.score,
    url: urlCase.url,
  };
}
