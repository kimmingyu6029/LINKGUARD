import assert from "node:assert/strict";
import test from "node:test";
import { buildAiUrlFeatureObject, handleAnalyzeUrl, handleHealth } from "../src/cloudflare/linkguardApi.js";
import { analyzeUrl } from "../src/lib/linkRiskAnalyzer.js";

test("Cloudflare health handler reports the Pages Functions runtime", async () => {
  const response = await handleHealth({});
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.runtime, "cloudflare-pages-functions");
  assert.equal(body.googleSafeBrowsingConfigured, false);
});

test("Cloudflare analyze handler skips reputation for invalid URLs", async () => {
  const request = new Request("https://example.test/api/analyze-url", {
    body: JSON.stringify({ mode: "normal", url: "not a url with space" }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const response = await handleAnalyzeUrl(request, {});
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.verdict, "invalid");
  assert.equal(body.reputation.status, "skipped");
});

test("Cloudflare analyze handler applies AI risk judgment after reputation lookup", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ options, url: String(url) });

    if (String(url).includes("openai.com")) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  confidence: 0.91,
                  needsHumanReview: true,
                  recommendedAction: "Do not open this link until the domain is verified.",
                  riskReasons: ["The host combines login and security lures on an unofficial domain."],
                  verdict: "malicious",
                }),
              },
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    return new Response("https://known-phish.test/login\n", {
      headers: { "Content-Type": "text/plain" },
      status: 200,
    });
  };

  try {
    const request = new Request("https://example.test/api/analyze-url", {
      body: JSON.stringify({ mode: "normal", url: "https://login-security-example.test/account" }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const response = await handleAnalyzeUrl(request, {
      OPENAI_API_KEY: "test-openai-key",
      OPENPHISH_FEED_URL: "https://openphish.test/feed.txt",
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.aiRisk.status, "malicious");
    assert.equal(body.verdict, "safe");
    assert.equal(body.verdictLabel, "SAFE");
    assert.equal(body.componentScores.ai, 82);
    assert.equal(body.contentAnalysis.status, "non_html");
    const aiCall = calls.find((call) => call.url.includes("openai.com"));
    assert.ok(aiCall);

    const aiRequestBody = JSON.parse(aiCall.options.body);
    const aiInput = JSON.parse(aiRequestBody.messages[1].content);
    assert.equal(aiInput.urlFeatures.structure.hostname, "login-security-example.test");
    assert.equal(aiInput.urlFeatures.structure.tld, "test");
    assert.equal(aiInput.urlFeatures.lexical.urlLength > 0, true);
    assert.equal(Array.isArray(aiInput.urlFeatures.evidenceItems), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare analyze handler uses Google Safe Browsing reputation matches", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ options, url: String(url) });

    if (String(url).includes("safebrowsing.googleapis.com")) {
      return new Response(
        JSON.stringify({
          matches: [
            {
              cacheDuration: "300s",
              platformType: "ANY_PLATFORM",
              threat: { url: "https://unsafe-gsb-example.test/login" },
              threatEntryType: "URL",
              threatType: "SOCIAL_ENGINEERING",
            },
          ],
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    return new Response("", { status: 200 });
  };

  try {
    const request = new Request("https://example.test/api/analyze-url", {
      body: JSON.stringify({ mode: "normal", url: "https://unsafe-gsb-example.test/login" }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const response = await handleAnalyzeUrl(request, {
      GOOGLE_SAFE_BROWSING_API_KEY: "test-google-key",
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.reputation.provider, "Google Safe Browsing");
    assert.equal(body.reputation.status, "match");
    assert.equal(body.reputation.matches[0].threatType, "SOCIAL_ENGINEERING");
    assert.equal(body.verdict, "malicious");
    assert.equal(calls.some((call) => call.url.includes("threatMatches:find")), true);
    assert.equal(calls.some((call) => call.url.includes("openphish")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare analyze handler downgrades stale single-engine VirusTotal detections", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    calls.push({ method: options.method || "GET", url: requestUrl });

    if (requestUrl.includes("virustotal.com")) {
      return new Response(
        JSON.stringify({
          data: {
            attributes: {
              last_analysis_date: 1580436802,
              last_analysis_results: {
                Quttera: {
                  category: "malicious",
                  engine_name: "Quttera",
                  method: "blacklist",
                  result: "malicious",
                },
              },
              last_analysis_stats: {
                harmless: 64,
                malicious: 1,
                suspicious: 0,
                timeout: 0,
                undetected: 7,
              },
            },
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (requestUrl.includes("openphish")) {
      return new Response("", {
        headers: { "Content-Type": "text/plain" },
        status: 200,
      });
    }

    return new Response("<!doctype html><title>YouTube</title>", {
      headers: { "Content-Type": "text/html" },
      status: 200,
    });
  };

  try {
    const request = new Request("https://example.test/api/analyze-url", {
      body: JSON.stringify({ mode: "normal", url: "https://www.youtube.com/watch?v=9Qc7xonwpQs" }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const response = await handleAnalyzeUrl(request, {
      OPENPHISH_FEED_URL: "https://openphish-vt-weak.test/feed.txt",
      VIRUSTOTAL_API_KEY: "test-vt-key",
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.reputation.provider, "VirusTotal");
    assert.equal(body.reputation.status, "suspicious");
    assert.equal(body.reputation.severity, "low");
    assert.notEqual(body.verdict, "malicious");
    assert.ok(body.score < 41);
    assert.equal(calls.some((call) => call.url.includes("virustotal.com")), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare analyze handler traces redirects and checks the final URL reputation", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    calls.push({ method: options.method || "GET", url: String(url) });

    if (String(url) === "https://short.example.test/go") {
      return new Response("", {
        headers: {
          Location: "https://final-phish.example.test/login",
        },
        status: 302,
      });
    }

    if (String(url) === "https://final-phish.example.test/login") {
      return new Response("", { status: 200 });
    }

    if (String(url).includes("openphish-redirect.test/feed.txt")) {
      return new Response("https://final-phish.example.test/login\n", {
        headers: { "Content-Type": "text/plain" },
        status: 200,
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const request = new Request("https://example.test/api/analyze-url", {
      body: JSON.stringify({ mode: "normal", url: "https://short.example.test/go" }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const response = await handleAnalyzeUrl(request, {
      OPENPHISH_FEED_URL: "https://openphish-redirect.test/feed.txt",
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.redirectTrace.status, "complete");
    assert.equal(body.redirectTrace.hopCount, 1);
    assert.equal(body.redirectTrace.finalUrl, "https://final-phish.example.test/login");
    assert.equal(body.reputation.provider, "OpenPhish");
    assert.equal(body.reputation.status, "match");
    assert.equal(body.reputation.matches[0].url, "https://final-phish.example.test/login");
    assert.equal(body.verdict, "malicious");
    assert.equal(calls.some((call) => call.method === "HEAD" && call.url === "https://short.example.test/go"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildAiUrlFeatureObject converts analyzeUrl output into model-ready features", () => {
  const analysis = analyzeUrl("https://secure-bank-login.example.test/auth?next=https%3A%2F%2Fevil.test%2Fpay", {
    mode: "expert",
  });
  const features = buildAiUrlFeatureObject(analysis);

  assert.equal(features.structure.hostname, "secure-bank-login.example.test");
  assert.equal(features.structure.pathDepth, 1);
  assert.equal(features.structure.queryParamCount, 1);
  assert.equal(features.structure.tld, "test");
  assert.equal(features.lexical.hyphenCount, 2);
  assert.equal(features.lexical.hasEncodedCharacters, true);
  assert.equal(features.heuristic.verdict, analysis.verdict);
  assert.equal(typeof features.signals.structure.tone, "string");
});
