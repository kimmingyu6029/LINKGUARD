import assert from "node:assert/strict";
import test from "node:test";
import { analyzeUrl } from "../src/lib/linkRiskAnalyzer.js";

test("flags obvious brand impersonation as malicious", () => {
  const result = analyzeUrl("http://paypal-login-secure.xyz/auth?verify=account&password=update");

  assert.equal(result.verdict, "malicious");
  assert.equal(result.tone, "danger");
  assert.ok(result.score >= 60);
  assert.ok(result.evidence.some((item) => item.label === "브랜드 사칭 가능성"));
});

test("normalizes scheme-less official domains before analysis", () => {
  const result = analyzeUrl("www.naver.com");

  assert.equal(result.displayUrl, "https://www.naver.com/");
  assert.equal(result.verdict, "safe");
  assert.ok(result.signals.some((signal) => signal.label === "도메인 신뢰도" && signal.value === "공식"));
});

test("flags Instagram lure links on unofficial domains", () => {
  const result = analyzeUrl("https://kkclip.com/open/ig/3824104089672233806/DUR8miZCDNO");

  assert.equal(result.verdict, "malicious");
  assert.ok(result.score >= 60);
  assert.ok(result.evidence.some((item) => item.label === "소셜 플랫폼 사칭 경로"));
  assert.ok(result.evidence.some((item) => item.label === "일회성 공유 코드"));
});

test("trusts the official Gachon University domain", () => {
  const result = analyzeUrl("https://www.gachon.ac.kr/");

  assert.equal(result.verdict, "safe");
  assert.ok(result.signals.some((signal) => signal.label === "도메인 신뢰도" && signal.value === "공식"));
});

test("trusts ordinary YouTube watch URLs as official domains", () => {
  const result = analyzeUrl("https://www.youtube.com/watch?v=9Qc7xonwpQs");

  assert.equal(result.verdict, "safe");
  assert.equal(result.score, 0);
  assert.ok(result.signals.some((signal) => signal.label === "도메인 신뢰도" && signal.value === "공식"));
});

test("does not treat ordinary words containing ig as Instagram lures", () => {
  const result = analyzeUrl("https://example.com/blog/sign-in-guide");

  assert.equal(result.verdict, "safe");
  assert.ok(!result.evidence.some((item) => item.label === "소셜 플랫폼 사칭 경로"));
});

test("keeps official Coupang marketing URLs safe", () => {
  const result = analyzeUrl(
    "https://www.coupang.com/?src=1042016&spec=10304903&addtag=900&ctag=HOME&lptag=%EC%BF%A0%ED%8C%A1&itime=20260521141131&pageType=HOME&pageValue=HOME&wPcid=17790863948844480875554&wRef=www.google.com&wTime=20260521141131&redirect=landing&gclid=CjwKCAjwt7XQBhBkEiwAtStppycT8M9RzYkZsIyGNDmljD0mZSue_MP0mEddCM6OzU3MpCqyGHZkORoCUDMQAvD_BwE&mcid=e9585044c6fa4b1092a3610b5568e236&campaignid=8704277940&adgroupid=86483039646&network=g",
  );

  assert.equal(result.verdict, "safe");
  assert.ok(result.signals.some((signal) => signal.label === "도메인 신뢰도" && signal.value === "공식"));
  assert.ok(!result.evidence.some((item) => item.label === "브랜드 사칭 가능성"));
});

test("warns when an official domain redirects to an external host", () => {
  const result = analyzeUrl(
    "https://www.coupang.com/?redirect=https%3A%2F%2Fexample-phish.test%2Flogin",
  );

  assert.equal(result.verdict, "suspicious");
  assert.ok(result.evidence.some((item) => item.label === "외부 리디렉션 대상"));
});
