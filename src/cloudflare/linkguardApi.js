import { analyzeUrl } from "../lib/linkRiskAnalyzer.js";
import { composeUrlVerdict } from "../lib/urlVerdictComposer.js";
import { getCommunityReportForUrls } from "./communityReports.js";

const CACHE_TTL_MS = 10 * 60 * 1000;
const SECURITY_CASE_CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_OPENPHISH_FEED_URL = "https://openphish.com/feed.txt";
const DEFAULT_KISA_SECURITY_RSS_URL = "https://www.boho.or.kr/kr/rss.do?bbsId=B0000133";
const REQUEST_LIMIT_BYTES = 16 * 1024;
const CONTENT_ANALYSIS_BYTES = 96 * 1024;
const CONTENT_ANALYSIS_TIMEOUT_MS = 3000;
const REDIRECT_TRACE_MAX_HOPS = 5;
const REDIRECT_TRACE_TIMEOUT_MS = 2500;
const VIRUSTOTAL_API_BASE_URL = "https://www.virustotal.com/api/v3";
const GOOGLE_SAFE_BROWSING_API_BASE_URL = "https://safebrowsing.googleapis.com/v4";
const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_AI_RISK_MODEL = "gpt-4o-mini";

const reputationCache = new Map();
let openPhishFeedCache = null;
let securityCaseCache = null;

export async function handleHealth(env = {}) {
  const config = getConfig(env);

  return sendJson(200, {
    ok: true,
    runtime: "cloudflare-pages-functions",
    reputationProvider: buildReputationProviderLabel(config),
    reputationFeedConfigured: Boolean(config.openPhishFeedUrl),
    googleSafeBrowsingConfigured: Boolean(config.googleSafeBrowsingApiKey),
    virusTotalConfigured: Boolean(config.virusTotalApiKey),
  });
}

export async function handleAnalyzeUrl(request, env = {}) {
  if (request.method !== "POST") {
    return sendJson(405, { error: "Method not allowed" });
  }

  const body = await readJsonBody(request);
  const url = typeof body.url === "string" ? body.url : "";
  const mode = body.mode === "expert" ? "expert" : "normal";
  const localAnalysis = analyzeUrl(url, { mode });

  if (!shouldCheckReputation(localAnalysis)) {
    return sendJson(
      200,
      composeUrlVerdict({
        analysis: localAnalysis,
        reputation: {
          detail: "The value is not an analyzable HTTP(S) URL, so reputation lookup was skipped.",
          label: "Reputation lookup skipped",
          provider: "OpenPhish",
          status: "skipped",
          tone: "blue",
        },
      }),
    );
  }

  const config = getConfig(env);
  const redirectTrace = await traceUrlRedirects(localAnalysis.displayUrl);
  const tracedAnalysis = attachRedirectTrace(localAnalysis, redirectTrace);
  const communityReport = await getCommunityReportForUrls(buildReputationLookupUrls(localAnalysis.displayUrl, redirectTrace), env);
  const reputation = await checkReputation(localAnalysis.displayUrl, config, redirectTrace);
  const contentResult = await analyzeWebpageContent(selectContentAnalysisUrl(localAnalysis, redirectTrace), tracedAnalysis);
  const analysisForAi = { ...tracedAnalysis, communityReport, contentAnalysis: contentResult };
  const aiRisk = await checkAiRiskJudge(analysisForAi, reputation, config);

  return sendJson(200, composeUrlVerdict({ aiRisk, analysis: tracedAnalysis, communityReport, contentResult, reputation }));
}

export async function handleSecurityCases(env = {}) {
  const config = getConfig(env);

  try {
    const cases = await getSecurityCases(config);

    return sendJson(200, {
      cases,
      sourceLabel: "KISA Boho RSS",
      sourcePageUrl: "https://www.boho.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020",
      sourceUrl: config.kisaSecurityRssUrl,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(502, {
      error: error.message || "Failed to load the KISA security RSS feed.",
      sourceLabel: "KISA Boho RSS",
      sourcePageUrl: "https://www.boho.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020",
      sourceUrl: config.kisaSecurityRssUrl,
    });
  }
}

function getConfig(env = {}) {
  return {
    kisaSecurityRssUrl: readEnv(env, "KISA_SECURITY_RSS_URL") || DEFAULT_KISA_SECURITY_RSS_URL,
    googleSafeBrowsingApiBaseUrl:
      readEnv(env, "GOOGLE_SAFE_BROWSING_API_BASE_URL") || GOOGLE_SAFE_BROWSING_API_BASE_URL,
    googleSafeBrowsingApiKey: readEnv(env, "GOOGLE_SAFE_BROWSING_API_KEY"),
    openPhishFeedUrl: readEnv(env, "OPENPHISH_FEED_URL") || DEFAULT_OPENPHISH_FEED_URL,
    openAiApiBaseUrl: readEnv(env, "OPENAI_API_BASE_URL") || OPENAI_API_BASE_URL,
    openAiApiKey: readEnv(env, "OPENAI_API_KEY"),
    openAiRiskModel: readEnv(env, "OPENAI_RISK_MODEL") || DEFAULT_AI_RISK_MODEL,
    virusTotalApiKey: readEnv(env, "VIRUSTOTAL_API_KEY"),
    virusTotalSubmitUnknown: readEnv(env, "VIRUSTOTAL_SUBMIT_UNKNOWN") === "true",
  };
}

function buildReputationProviderLabel(config) {
  return [
    config.virusTotalApiKey ? "VirusTotal" : "",
    config.googleSafeBrowsingApiKey ? "Google Safe Browsing" : "",
    "OpenPhish",
  ]
    .filter(Boolean)
    .join(" + ");
}

function readEnv(env, key) {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    return String(env[key] || "").trim();
  }

  return "";
}

function shouldCheckReputation(analysis) {
  return Boolean(
    analysis.displayUrl &&
      /^https?:\/\//i.test(analysis.displayUrl) &&
      !["blocked", "idle", "invalid"].includes(analysis.verdict),
  );
}

async function checkReputation(url, config, redirectTrace = null) {
  const lookupUrls = buildReputationLookupUrls(url, redirectTrace);
  const virusTotalReputation = config.virusTotalApiKey
    ? await checkReputationProviderForUrls(lookupUrls, (lookupUrl) => checkVirusTotal(lookupUrl, config))
    : null;
  if (virusTotalReputation?.status === "match") {
    return virusTotalReputation;
  }

  const googleSafeBrowsingReputation = config.googleSafeBrowsingApiKey
    ? await checkReputationProviderForUrls(lookupUrls, (lookupUrl) => checkGoogleSafeBrowsing(lookupUrl, config))
    : null;
  if (googleSafeBrowsingReputation?.status === "match") {
    return googleSafeBrowsingReputation;
  }

  const openPhishReputation = await checkReputationProviderForUrls(lookupUrls, (lookupUrl) =>
    checkOpenPhish(lookupUrl, config),
  );
  if (openPhishReputation.status === "match") {
    return openPhishReputation;
  }

  return virusTotalReputation || googleSafeBrowsingReputation || openPhishReputation;
}

function buildReputationLookupUrls(url, redirectTrace = null) {
  return [
    url,
    ...(redirectTrace?.hops || []).map((hop) => hop.targetUrl),
    redirectTrace?.finalUrl,
  ]
    .filter(Boolean)
    .filter((item, index, items) => items.findIndex((candidate) => normalizeUrlForMatch(candidate) === normalizeUrlForMatch(item)) === index);
}

async function checkReputationProviderForUrls(urls, providerCheck) {
  let fallback = null;

  for (const url of urls) {
    const reputation = await providerCheck(url);
    if (reputation?.status === "match") {
      return reputation;
    }

    fallback ||= reputation;
  }

  return fallback;
}

async function checkAiRiskJudge(analysis, reputation, config) {
  if (!config.openAiApiKey) {
    return {
      detail: "OPENAI_API_KEY가 설정되지 않아 AI 위험 판단을 건너뛰었습니다.",
      label: "AI 위험 판단 건너뜀",
      provider: "OpenAI",
      status: "skipped",
      tone: "blue",
    };
  }

  if (!shouldCheckReputation(analysis)) {
    return {
      detail: "분석 가능한 HTTP(S) URL이 아니어서 AI 위험 판단을 건너뛰었습니다.",
      label: "AI 위험 판단 건너뜀",
      provider: "OpenAI",
      status: "skipped",
      tone: "blue",
    };
  }

  try {
    const response = await fetch(`${config.openAiApiBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
      body: JSON.stringify({
        messages: [
          {
            content:
              "You are a security URL risk classifier for Korean users. Use only the supplied structured signals. Return strict JSON with verdict, confidence, riskReasons, benignReasons, recommendedAction, and needsHumanReview. Write riskReasons, benignReasons, and recommendedAction in Korean. Prefer unknown or suspicious when evidence is incomplete. Never downgrade a confirmed reputation threat.",
            role: "system",
          },
          {
            content: JSON.stringify(buildAiRiskJudgeInput(analysis, reputation)),
            role: "user",
          },
        ],
        model: config.openAiRiskModel,
        response_format: { type: "json_object" },
        temperature: 0,
      }),
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      const message = await response.text();
      return {
        detail: `AI 위험 판단 응답 오류 (${response.status}): ${message.slice(0, 180)}`,
        label: "AI 위험 판단 오류",
        provider: "OpenAI",
        status: "error",
        tone: "warn",
      };
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content || "";
    const parsed = parseAiRiskJudgeContent(rawContent);
    return normalizeAiRiskJudgment(parsed);
  } catch (error) {
    return {
      detail: `AI 위험 판단 조회 중 네트워크 오류가 발생했습니다: ${error.message}`,
      label: "AI 위험 판단 연결 실패",
      provider: "OpenAI",
      status: "error",
      tone: "warn",
    };
  }
}

function buildAiRiskJudgeInput(analysis, reputation) {
  return {
    task: "Classify the URL risk from the provided local heuristic and reputation signals.",
    urlFeatures: buildAiUrlFeatureObject(analysis),
    localHeuristic: {
      score: analysis.score,
      verdict: analysis.verdict,
    },
    reputation: {
      detail: reputation?.detail || "",
      label: reputation?.label || "",
      provider: reputation?.provider || "",
      stats: reputation?.stats || null,
      status: reputation?.status || "unknown",
      tone: reputation?.tone || "blue",
    },
    redirectTrace: analysis.redirectTrace || null,
    communityReport: analysis.communityReport || null,
    contentAnalysis: buildAiContentFeatureObject(analysis.contentAnalysis),
    outputContract: {
      benignReasons: "array of short strings",
      confidence: "number from 0 to 1",
      needsHumanReview: "boolean",
      recommendedAction: "short user-safe action",
      riskReasons: "array of short strings",
      verdict: "safe | suspicious | malicious | unknown",
    },
  };
}

export function buildAiUrlFeatureObject(analysis) {
  const parsedUrl = parseAnalysisUrl(analysis.displayUrl);
  const redirectTrace = analysis.redirectTrace || null;
  const hostLabels = String(analysis.displayHost || "")
    .split(".")
    .filter(Boolean);
  const registrableLabels = String(analysis.registrableDomain || "")
    .split(".")
    .filter(Boolean);
  const pathSegments = parsedUrl
    ? parsedUrl.pathname
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean)
    : [];
  const queryParamNames = parsedUrl ? [...parsedUrl.searchParams.keys()] : [];
  const signalMap = Object.fromEntries(
    (analysis.signals || []).map((signal) => [
      signal.key,
      {
        tone: signal.tone,
        value: signal.value,
      },
    ]),
  );
  const evidenceItems = (analysis.evidence || [])
    .slice()
    .sort((left, right) => Number(right.points || 0) - Number(left.points || 0))
    .slice(0, 8)
    .map((item) => ({
      detail: item.detail || "",
      label: item.label || "",
      points: Number(item.points || 0),
    }));

  return {
    evidenceItems,
    heuristic: {
      score: Number(analysis.score || 0),
      tone: analysis.tone || "blue",
      verdict: analysis.verdict || "unknown",
    },
    lexical: {
      digitCount: countMatches(analysis.displayHost, /\d/g),
      hasAtSign: String(analysis.input || analysis.displayUrl || "").includes("@"),
      hasEncodedCharacters: /%[0-9a-f]{2}/i.test(analysis.displayUrl || ""),
      hyphenCount: countMatches(analysis.displayHost, /-/g),
      urlLength: String(analysis.displayUrl || analysis.input || "").length,
    },
    signals: signalMap,
    structure: {
      displayHost: analysis.displayHost || "",
      displayUrl: analysis.displayUrl || "",
      finalUrl: redirectTrace?.finalUrl || analysis.displayUrl || "",
      hostname: parsedUrl?.hostname || analysis.displayHost || "",
      pathDepth: pathSegments.length,
      protocol: parsedUrl?.protocol?.replace(":", "") || "",
      queryParamCount: queryParamNames.length,
      queryParamNames: queryParamNames.slice(0, 12),
      registrableDomain: analysis.registrableDomain || "",
      subdomainCount: Math.max(0, hostLabels.length - registrableLabels.length),
      tld: hostLabels.at(-1) || "",
    },
    redirectTrace: {
      finalHost: redirectTrace?.finalHost || "",
      finalUrl: redirectTrace?.finalUrl || "",
      hopCount: redirectTrace?.hopCount || 0,
      hops: (redirectTrace?.hops || []).slice(0, REDIRECT_TRACE_MAX_HOPS),
      status: redirectTrace?.status || "not_checked",
    },
  };
}

function buildAiContentFeatureObject(contentAnalysis = null) {
  if (!contentAnalysis) {
    return {
      status: "not_checked",
    };
  }

  return {
    brandDomainMismatch: Boolean(contentAnalysis.brandDomainMismatch),
    brandKeywords: contentAnalysis.brandKeywords || [],
    downloadLinks: (contentAnalysis.downloadLinks || []).slice(0, 8),
    externalScriptCount: Number(contentAnalysis.externalScriptCount || 0),
    formActions: (contentAnalysis.formActions || []).slice(0, 8),
    hasLoginForm: Boolean(contentAnalysis.hasLoginForm),
    hasPasswordInput: Boolean(contentAnalysis.hasPasswordInput),
    sensitivePrompts: contentAnalysis.sensitivePrompts || [],
    suspiciousJsPatterns: contentAnalysis.suspiciousJsPatterns || [],
    score: Number(contentAnalysis.score || 0),
    status: contentAnalysis.status || "unknown",
    title: contentAnalysis.title || "",
  };
}

function parseAnalysisUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function countMatches(value, pattern) {
  return (String(value || "").match(pattern) || []).length;
}

function parseAiRiskJudgeContent(rawContent) {
  try {
    return JSON.parse(rawContent);
  } catch {
    return {
      recommendedAction: "Manual review is recommended because the AI response could not be parsed.",
      verdict: "unknown",
    };
  }
}

function normalizeAiRiskJudgment(value = {}) {
  const verdicts = new Set(["safe", "suspicious", "malicious", "unknown"]);
  const verdict = verdicts.has(value.verdict) ? value.verdict : "unknown";
  const confidence = clampNumber(Number(value.confidence || 0), 0, 1);
  const tone = verdict === "malicious" ? "danger" : verdict === "suspicious" || verdict === "unknown" ? "warn" : "safe";

  return {
    benignReasons: normalizeStringList(value.benignReasons),
    confidence,
    detail: value.recommendedAction || "AI 위험 판단이 완료되었습니다.",
    label: "AI 위험 판단",
    needsHumanReview: Boolean(value.needsHumanReview || verdict === "unknown" || confidence < 0.7),
    provider: "OpenAI",
    recommendedAction: String(value.recommendedAction || ""),
    riskReasons: normalizeStringList(value.riskReasons),
    status: verdict,
    tone,
    verdict,
  };
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5) : [];
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

async function traceUrlRedirects(url) {
  const startUrl = parseAnalysisUrl(url);

  if (!startUrl || !["http:", "https:"].includes(startUrl.protocol)) {
    return buildRedirectTrace({
      detail: "Redirect tracing was skipped because the URL is not HTTP(S).",
      finalUrl: url,
      status: "skipped",
    });
  }

  if (isBlockedRedirectHost(startUrl.hostname)) {
    return buildRedirectTrace({
      detail: "Redirect tracing was blocked for a local or private host.",
      finalUrl: startUrl.href,
      status: "blocked",
    });
  }

  const hops = [];
  let currentUrl = startUrl.href;

  for (let hopIndex = 0; hopIndex < REDIRECT_TRACE_MAX_HOPS; hopIndex += 1) {
    const currentParsedUrl = parseAnalysisUrl(currentUrl);

    if (!currentParsedUrl || isBlockedRedirectHost(currentParsedUrl.hostname)) {
      return buildRedirectTrace({
        detail: "Redirect tracing stopped before requesting a local or private host.",
        finalUrl: currentUrl,
        hops,
        status: "blocked",
      });
    }

    try {
      const response = await fetchRedirectProbe(currentUrl, "HEAD");
      const fallbackResponse =
        response.status === 405 || response.status === 501 ? await fetchRedirectProbe(currentUrl, "GET") : response;
      const location = fallbackResponse.headers.get("location");

      if (!isRedirectStatus(fallbackResponse.status) || !location) {
        return buildRedirectTrace({
          finalUrl: currentUrl,
          hops,
          status: "complete",
        });
      }

      const targetUrl = resolveRedirectLocation(currentUrl, location);
      if (!targetUrl) {
        return buildRedirectTrace({
          detail: "Redirect tracing stopped because the redirect Location header was invalid.",
          finalUrl: currentUrl,
          hops,
          status: "invalid_location",
        });
      }

      const targetParsedUrl = parseAnalysisUrl(targetUrl);
      if (!targetParsedUrl || !["http:", "https:"].includes(targetParsedUrl.protocol)) {
        return buildRedirectTrace({
          detail: "Redirect tracing stopped because the redirect target is not HTTP(S).",
          finalUrl: targetUrl,
          hops,
          status: "blocked",
        });
      }

      if (isBlockedRedirectHost(targetParsedUrl.hostname)) {
        hops.push(buildRedirectHop(currentUrl, targetUrl, fallbackResponse.status));
        return buildRedirectTrace({
          detail: "Redirect tracing stopped before following a local or private redirect target.",
          finalUrl: targetUrl,
          hops,
          status: "blocked",
        });
      }

      hops.push(buildRedirectHop(currentUrl, targetUrl, fallbackResponse.status));
      currentUrl = targetUrl;
    } catch (error) {
      return buildRedirectTrace({
        detail: `Redirect tracing failed: ${error.message}`,
        finalUrl: currentUrl,
        hops,
        status: "error",
      });
    }
  }

  return buildRedirectTrace({
    detail: `Redirect tracing stopped after ${REDIRECT_TRACE_MAX_HOPS} hop(s).`,
    finalUrl: currentUrl,
    hops,
    status: "max_hops",
  });
}

async function fetchRedirectProbe(url, method) {
  return fetch(url, {
    headers: method === "GET" ? { Range: "bytes=0-0" } : {},
    method,
    redirect: "manual",
    signal: createRedirectTraceSignal(),
  });
}

function createRedirectTraceSignal() {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(REDIRECT_TRACE_TIMEOUT_MS)
    : undefined;
}

function buildRedirectHop(sourceUrl, targetUrl, statusCode) {
  return {
    sourceHost: parseAnalysisUrl(sourceUrl)?.hostname || "",
    sourceUrl,
    statusCode,
    targetHost: parseAnalysisUrl(targetUrl)?.hostname || "",
    targetUrl,
  };
}

function buildRedirectTrace({ detail = "", finalUrl = "", hops = [], status }) {
  const finalHost = parseAnalysisUrl(finalUrl)?.hostname || "";

  return {
    detail,
    finalHost,
    finalUrl,
    hopCount: hops.length,
    hops,
    status,
  };
}

function attachRedirectTrace(analysis, redirectTrace) {
  const result = structuredClone(analysis);
  result.redirectTrace = redirectTrace;

  if (!redirectTrace || redirectTrace.status === "skipped") {
    return result;
  }

  const hasRedirect = redirectTrace.hopCount > 0;
  const isTraceProblem = ["blocked", "error", "invalid_location", "max_hops"].includes(redirectTrace.status);
  result.signals = [
    {
      key: "redirectTrace",
      label: "Redirect trace",
      tone: isTraceProblem ? "warn" : hasRedirect ? "warn" : "safe",
      value: hasRedirect ? `${redirectTrace.hopCount} hop(s)` : "None",
    },
    ...result.signals,
  ];

  if (hasRedirect || isTraceProblem) {
    result.evidence = [
      {
        detail:
          redirectTrace.detail ||
          (hasRedirect
            ? `The URL redirects to ${redirectTrace.finalHost || redirectTrace.finalUrl}.`
            : "Redirect tracing completed without following another URL."),
        label: "Redirect trace",
        points: isTraceProblem ? 18 : 10,
      },
      ...result.evidence,
    ];
    result.score = Math.min(100, Math.max(result.score, isTraceProblem ? result.score + 8 : result.score));
  }

  return result;
}

function selectContentAnalysisUrl(analysis, redirectTrace) {
  const finalUrl = redirectTrace?.finalUrl || "";
  const parsedFinalUrl = parseAnalysisUrl(finalUrl);

  if (parsedFinalUrl && ["http:", "https:"].includes(parsedFinalUrl.protocol) && !isBlockedRedirectHost(parsedFinalUrl.hostname)) {
    return parsedFinalUrl.href;
  }

  return analysis.displayUrl;
}

async function analyzeWebpageContent(url, analysis) {
  const parsedUrl = parseAnalysisUrl(url);

  if (!parsedUrl || !["http:", "https:"].includes(parsedUrl.protocol)) {
    return buildContentAnalysisResult({
        detail: "최종 URL이 HTTP(S)가 아니어서 콘텐츠 분석을 건너뛰었습니다.",
      finalUrl: url,
      score: 0,
      status: "skipped",
    });
  }

  if (isBlockedRedirectHost(parsedUrl.hostname)) {
    return buildContentAnalysisResult({
      detail: "로컬 또는 사설망 호스트라서 콘텐츠 분석을 차단했습니다.",
      finalUrl: parsedUrl.href,
      score: 100,
      status: "blocked",
    });
  }

  try {
    const response = await fetch(parsedUrl.href, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
        Range: `bytes=0-${CONTENT_ANALYSIS_BYTES - 1}`,
        "User-Agent": "LinkGuardAI/0.1",
      },
      method: "GET",
      redirect: "manual",
      signal: createContentAnalysisSignal(),
    });

    if (isRedirectStatus(response.status)) {
      return buildContentAnalysisResult({
        detail: "최종 URL에서 추가 리다이렉트가 발생해 콘텐츠 분석을 중단했습니다.",
        finalUrl: parsedUrl.href,
        httpStatus: response.status,
        score: 20,
        status: "redirect",
      });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      return buildContentAnalysisResult({
        detail: `웹페이지 콘텐츠 요청이 HTTP ${response.status}로 실패했습니다.`,
        finalUrl: parsedUrl.href,
        httpStatus: response.status,
        score: 20,
        status: "error",
      });
    }

    const body = (await response.text()).slice(0, CONTENT_ANALYSIS_BYTES);
    if (!isLikelyHtmlContent(body, contentType)) {
      return buildContentAnalysisResult({
        contentType,
        detail: "응답이 HTML 웹페이지로 보이지 않아 콘텐츠 분석이 제한되었습니다.",
        finalUrl: parsedUrl.href,
        httpStatus: response.status,
        score: 20,
        status: "non_html",
      });
    }

    return inspectWebpageContent({
      analysis,
      body,
      contentType,
      finalUrl: parsedUrl.href,
      httpStatus: response.status,
    });
  } catch (error) {
    return buildContentAnalysisResult({
      detail: `콘텐츠 분석 중 오류가 발생했습니다: ${error.message}`,
      finalUrl: parsedUrl.href,
      score: 20,
      status: "error",
    });
  }
}

function createContentAnalysisSignal() {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(CONTENT_ANALYSIS_TIMEOUT_MS)
    : undefined;
}

function isLikelyHtmlContent(body, contentType) {
  const normalizedContentType = String(contentType || "").toLowerCase();
  const sample = String(body || "").slice(0, 2048).toLowerCase();

  return (
    normalizedContentType.includes("text/html") ||
    normalizedContentType.includes("application/xhtml") ||
    /<html\b|<body\b|<form\b|<input\b|<script\b|<title\b/.test(sample)
  );
}

function inspectWebpageContent({ analysis, body, contentType, finalUrl, httpStatus }) {
  const finalParsedUrl = parseAnalysisUrl(finalUrl);
  const finalHost = finalParsedUrl?.hostname?.toLowerCase() || "";
  const finalRegistrableDomain = getRegistrableDomainFromHost(finalHost);
  const html = String(body || "");
  const lowerHtml = html.toLowerCase();
  const visibleText = extractVisibleText(html).toLowerCase();
  const title = extractTitle(html);
  const formActions = extractFormActions(html, finalUrl);
  const downloadLinks = extractDownloadLinks(html, finalUrl);
  const suspiciousJsPatterns = findSuspiciousJsPatterns(lowerHtml);
  const brandKeywords = findContentBrandKeywords(`${title} ${visibleText}`);
  const brandDomainMismatch = brandKeywords.some((brand) =>
    brand.domains.every((domain) => !isSameOrSubdomain(finalHost, domain)),
  );
  const sensitivePrompts = findSensitivePrompts(visibleText);
  const hasPasswordInput = /<input\b[^>]*type\s*=\s*["']?password\b/i.test(html);
  const hasLoginForm = hasPasswordInput || /<form\b/i.test(html) && /\b(login|signin|sign-in|auth|account)\b/i.test(html);
  const currentDomainFormActions = formActions.filter((action) => {
    const actionHost = parseAnalysisUrl(action)?.hostname?.toLowerCase() || "";
    return actionHost && getRegistrableDomainFromHost(actionHost) !== finalRegistrableDomain;
  });
  const externalScriptCount = countExternalScripts(html, finalRegistrableDomain, finalUrl);
  const executableDownload = downloadLinks.some((link) => /\.(apk|exe|msi|bat|cmd|scr|vbs|js|zip)(?:[?#]|$)/i.test(link));
  const evidence = [];
  let score = 0;
  const addRisk = (points, label, detail) => {
    score += points;
    evidence.push({ detail, label, points });
  };

  if (hasPasswordInput) {
    addRisk(35, "비밀번호 입력창 감지", "페이지에 비밀번호 입력창이 있습니다.");
  }

  if (hasLoginForm) {
    addRisk(20, "로그인 폼 감지", "페이지가 사용자에게 로그인을 요구하는 것으로 보입니다.");
  }

  if (brandDomainMismatch) {
    addRisk(
      35,
      "브랜드/도메인 불일치",
      `페이지에 ${brandKeywords.map((brand) => brand.name).slice(0, 3).join(", ")} 관련 문구가 있지만 공식 도메인과 일치하지 않습니다.`,
    );
  }

  if (currentDomainFormActions.length > 0) {
    addRisk(25, "외부 도메인 폼 전송", "입력 폼이 현재 사이트와 다른 도메인으로 전송됩니다.");
  }

  if (sensitivePrompts.length > 0) {
    addRisk(20, "민감 정보 입력 유도", `페이지가 민감 정보 입력을 요구합니다: ${sensitivePrompts.slice(0, 3).join(", ")}.`);
  }

  if (suspiciousJsPatterns.length > 0) {
    addRisk(18, "의심스러운 JavaScript", `의심스러운 JavaScript 패턴이 발견되었습니다: ${suspiciousJsPatterns.slice(0, 4).join(", ")}.`);
  }

  if (executableDownload) {
    addRisk(35, "실행 파일 다운로드 유도", "실행 파일 또는 설치 파일 다운로드 링크가 있습니다.");
  } else if (downloadLinks.length > 0) {
    addRisk(10, "다운로드 링크 감지", "페이지에 다운로드 링크가 포함되어 있습니다.");
  }

  if (externalScriptCount >= 8) {
    addRisk(10, "외부 스크립트 다수", "페이지가 많은 외부 스크립트를 불러옵니다.");
  }

  return buildContentAnalysisResult({
    brandDomainMismatch,
    brandKeywords: brandKeywords.map((brand) => brand.name),
    contentType,
    detail: evidence.length > 0 ? "웹페이지 콘텐츠에서 위험 신호가 발견되었습니다." : "웹페이지 콘텐츠 분석에서 큰 위험 신호는 발견되지 않았습니다.",
    downloadLinks,
    evidence,
    externalScriptCount,
    finalUrl,
    formActions,
    hasLoginForm,
    hasPasswordInput,
    httpStatus,
    score: clampNumber(Math.round(score), 0, 100),
    sensitivePrompts,
    status: "complete",
    suspiciousJsPatterns,
    title,
  });
}

function buildContentAnalysisResult({
  brandDomainMismatch = false,
  brandKeywords = [],
  contentType = "",
  detail = "",
  downloadLinks = [],
  evidence = [],
  externalScriptCount = 0,
  finalUrl = "",
  formActions = [],
  hasLoginForm = false,
  hasPasswordInput = false,
  httpStatus = null,
  score = 0,
  sensitivePrompts = [],
  status = "unknown",
  suspiciousJsPatterns = [],
  title = "",
}) {
  return {
    brandDomainMismatch,
    brandKeywords,
    contentType,
    detail,
    downloadLinks,
    evidence,
    externalScriptCount,
    finalUrl,
    formActions,
    hasLoginForm,
    hasPasswordInput,
    httpStatus,
    score: clampNumber(score, 0, 100),
    sensitivePrompts,
    status,
    suspiciousJsPatterns,
    title,
  };
}

function extractTitle(html) {
  const match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return normalizeWhitespace(stripTags(match?.[1] || "")).slice(0, 160);
}

function extractVisibleText(html) {
  return normalizeWhitespace(
    stripTags(
      String(html || "")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " "),
    ),
  ).slice(0, 8000);
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractFormActions(html, baseUrl) {
  return [...String(html || "").matchAll(/<form\b[^>]*>/gi)]
    .map((match) => extractAttribute(match[0], "action"))
    .filter(Boolean)
    .map((action) => resolveUrl(baseUrl, action))
    .filter(Boolean)
    .slice(0, 12);
}

function extractDownloadLinks(html, baseUrl) {
  return [...String(html || "").matchAll(/<a\b[^>]*>/gi)]
    .map((match) => extractAttribute(match[0], "href"))
    .filter((href) => /\.(apk|exe|msi|bat|cmd|scr|vbs|js|zip|rar|7z|dmg)(?:[?#]|$)/i.test(href))
    .map((href) => resolveUrl(baseUrl, href))
    .filter(Boolean)
    .slice(0, 12);
}

function extractAttribute(tag, attributeName) {
  const pattern = new RegExp(`\\b${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = String(tag || "").match(pattern);
  return (match?.[1] || match?.[2] || match?.[3] || "").trim();
}

function resolveUrl(baseUrl, value) {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return "";
  }
}

function countExternalScripts(html, currentRegistrableDomain, baseUrl) {
  return [...String(html || "").matchAll(/<script\b[^>]*>/gi)].filter((match) => {
    const src = extractAttribute(match[0], "src");
    if (!src) {
      return false;
    }

    const parsedSrc = parseAnalysisUrl(resolveUrl(baseUrl, src));
    if (!parsedSrc) {
      return false;
    }

    return getRegistrableDomainFromHost(parsedSrc.hostname) !== currentRegistrableDomain;
  }).length;
}

function findSuspiciousJsPatterns(lowerHtml) {
  return ["eval(", "atob(", "document.write", "fromcharcode", "unescape("].filter((pattern) =>
    lowerHtml.includes(pattern),
  );
}

function findSensitivePrompts(text) {
  const prompts = [
    { label: "password", pattern: /\b(password|passcode|비밀번호)\b/i },
    { label: "authentication code", pattern: /\b(otp|verification code|인증번호|본인인증)\b/i },
    { label: "card number", pattern: /\b(card number|credit card|카드번호|카드 정보)\b/i },
    { label: "account number", pattern: /\b(account number|계좌번호)\b/i },
    { label: "personal information", pattern: /\b(ssn|resident registration|개인정보|주민등록)\b/i },
    { label: "payment", pattern: /\b(payment|billing|결제)\b/i },
  ];

  return prompts.filter((item) => item.pattern.test(text)).map((item) => item.label);
}

function findContentBrandKeywords(text) {
  const lowerText = String(text || "").toLowerCase();
  const brands = [
    { domains: ["kakao.com", "daum.net"], name: "kakao", tokens: ["kakao", "카카오"] },
    { domains: ["naver.com", "naver.me"], name: "naver", tokens: ["naver", "네이버"] },
    { domains: ["epost.go.kr", "koreapost.go.kr"], name: "koreapost", tokens: ["koreapost", "우체국", "택배"] },
    { domains: ["gov.kr", "hometax.go.kr"], name: "government", tokens: ["hometax", "정부", "국세청", "관세청"] },
    { domains: ["kbstar.com", "kbcard.com"], name: "kb", tokens: ["kbstar", "kb국민", "국민은행"] },
    { domains: ["shinhan.com", "shinhanbank.com"], name: "shinhan", tokens: ["shinhan", "신한"] },
    { domains: ["wooribank.com"], name: "woori", tokens: ["woori", "우리은행"] },
    { domains: ["hanabank.com", "kebhana.com"], name: "hana", tokens: ["hana", "하나은행"] },
    { domains: ["toss.im", "tossbank.com"], name: "toss", tokens: ["toss", "토스"] },
    { domains: ["paypal.com"], name: "paypal", tokens: ["paypal"] },
    { domains: ["google.com", "gmail.com", "youtube.com", "youtu.be"], name: "google", tokens: ["google", "gmail"] },
    { domains: ["youtube.com", "youtu.be", "google.com"], name: "youtube", tokens: ["youtube", "유튜브"] },
    { domains: ["apple.com", "icloud.com"], name: "apple", tokens: ["apple", "icloud"] },
    { domains: ["microsoft.com", "office.com", "outlook.com", "live.com"], name: "microsoft", tokens: ["microsoft", "office365", "outlook"] },
  ];

  return brands.filter((brand) => brand.tokens.some((token) => lowerText.includes(token.toLowerCase())));
}

function getRegistrableDomainFromHost(hostname) {
  const labels = String(hostname || "").toLowerCase().replace(/^www\./, "").split(".").filter(Boolean);

  if (labels.length <= 2) {
    return labels.join(".");
  }

  const multipartSuffixes = ["ac.kr", "co.kr", "go.kr", "or.kr", "re.kr", "com.au", "co.jp", "co.uk", "org.uk"];
  const host = labels.join(".");
  const suffix = multipartSuffixes.find((item) => host.endsWith(`.${item}`));

  if (suffix) {
    return labels.slice(-(suffix.split(".").length + 1)).join(".");
  }

  return labels.slice(-2).join(".");
}

function isSameOrSubdomain(hostname, domain) {
  const normalizedHost = String(hostname || "").toLowerCase().replace(/^www\./, "");
  const normalizedDomain = String(domain || "").toLowerCase();
  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

function resolveRedirectLocation(sourceUrl, location) {
  try {
    return new URL(location, sourceUrl).href;
  } catch {
    return "";
  }
}

function isRedirectStatus(statusCode) {
  return [301, 302, 303, 307, 308].includes(Number(statusCode));
}

function isBlockedRedirectHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "");

  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }

  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) {
    return true;
  }

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first === 169 && second === 254 ||
    first === 172 && second >= 16 && second <= 31 ||
    first === 192 && second === 168
  );
}

async function checkGoogleSafeBrowsing(url, config) {
  const cacheKey = `google-safe-browsing:${normalizeUrlForMatch(url)}`;
  const cached = reputationCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.reputation, cached: true };
  }

  try {
    const endpoint = `${config.googleSafeBrowsingApiBaseUrl.replace(/\/+$/, "")}/threatMatches:find?key=${encodeURIComponent(
      config.googleSafeBrowsingApiKey,
    )}`;
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        client: {
          clientId: "linkguard-ai-ui",
          clientVersion: "0.1.0",
        },
        threatInfo: {
          platformTypes: ["ANY_PLATFORM"],
          threatEntries: [{ url }],
          threatEntryTypes: ["URL"],
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
        },
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      const message = await response.text();
      return {
        detail: `Google Safe Browsing response error (${response.status}): ${message.slice(0, 180)}`,
        label: "Google Safe Browsing error",
        provider: "Google Safe Browsing",
        status: "error",
        tone: "warn",
      };
    }

    const data = await response.json();
    const matches = normalizeGoogleSafeBrowsingMatches(data?.matches, url);
    const reputation =
      matches.length > 0
        ? {
            detail: `Google Safe Browsing에서 안전하지 않은 URL 일치 항목 ${matches.length}개를 보고했습니다.`,
            label: "Google Safe Browsing 위협 일치",
            matches,
            provider: "Google Safe Browsing",
            status: "match",
            tone: "danger",
          }
        : {
            detail: "Google Safe Browsing에서 이 URL에 대한 위협 일치 항목을 보고하지 않았습니다.",
            label: "Google Safe Browsing 미탐지",
            matches: [],
            provider: "Google Safe Browsing",
            status: "clean",
            tone: "safe",
          };

    reputationCache.set(cacheKey, { createdAt: Date.now(), reputation });
    return reputation;
  } catch (error) {
    return {
      detail: `Google Safe Browsing 조회 중 네트워크 오류가 발생했습니다: ${error.message}`,
      label: "Google Safe Browsing 연결 실패",
      provider: "Google Safe Browsing",
      status: "error",
      tone: "warn",
    };
  }
}

function normalizeGoogleSafeBrowsingMatches(matches = [], fallbackUrl = "") {
  return Array.isArray(matches)
    ? matches.slice(0, 8).map((match) => ({
        cacheDuration: String(match?.cacheDuration || ""),
        platformType: String(match?.platformType || ""),
        threatEntryType: String(match?.threatEntryType || ""),
        threatType: String(match?.threatType || ""),
        url: String(match?.threat?.url || fallbackUrl),
      }))
    : [];
}

async function checkVirusTotal(url, config) {
  const cacheKey = `virustotal:${normalizeUrlForMatch(url)}`;
  const cached = reputationCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.reputation, cached: true };
  }

  try {
    const urlId = createVirusTotalUrlId(url);
    const response = await fetch(`${VIRUSTOTAL_API_BASE_URL}/urls/${encodeURIComponent(urlId)}`, {
      headers: {
        Accept: "application/json",
        "x-apikey": config.virusTotalApiKey,
      },
    });

    if (response.status === 404) {
      const reputation = config.virusTotalSubmitUnknown
        ? await submitVirusTotalUrl(url, config)
        : {
            detail:
              "VirusTotal에 기존 URL 리포트가 없습니다. VIRUSTOTAL_SUBMIT_UNKNOWN=true를 설정하면 알려지지 않은 URL을 분석 대상으로 제출할 수 있습니다.",
            label: "VirusTotal 리포트 없음",
            provider: "VirusTotal",
            status: "not_found",
            tone: "warn",
          };
      reputationCache.set(cacheKey, { createdAt: Date.now(), reputation });
      return reputation;
    }

    if (!response.ok) {
      const message = await response.text();
      return {
        detail: `VirusTotal response error (${response.status}): ${message.slice(0, 180)}`,
        label: "VirusTotal error",
        provider: "VirusTotal",
        status: "error",
        tone: "warn",
      };
    }

    const data = await response.json();
    const reputation = buildVirusTotalReputation(data);
    reputationCache.set(cacheKey, { createdAt: Date.now(), reputation });
    return reputation;
  } catch (error) {
    return {
      detail: `Network error while querying VirusTotal: ${error.message}`,
      label: "VirusTotal connection failed",
      provider: "VirusTotal",
      status: "error",
      tone: "warn",
    };
  }
}

async function submitVirusTotalUrl(url, config) {
  const body = new URLSearchParams({ url });
  const response = await fetch(`${VIRUSTOTAL_API_BASE_URL}/urls`, {
    body,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-apikey": config.virusTotalApiKey,
    },
    method: "POST",
  });

  if (!response.ok) {
    const message = await response.text();
    return {
      detail: `VirusTotal 제출 오류 (${response.status}): ${message.slice(0, 180)}`,
      label: "VirusTotal 제출 실패",
      provider: "VirusTotal",
      status: "error",
      tone: "warn",
    };
  }

  const data = await response.json();
  return {
    analysisId: data?.data?.id,
    detail: "VirusTotal에 기존 리포트가 없어 URL을 분석 대상으로 제출했습니다.",
    label: "VirusTotal 분석 제출",
    provider: "VirusTotal",
    status: "submitted",
    tone: "warn",
  };
}

function buildVirusTotalReputation(data) {
  const attributes = data?.data?.attributes || {};
  const stats = attributes.last_analysis_stats || {};
  const malicious = Number(stats.malicious || 0);
  const suspicious = Number(stats.suspicious || 0);
  const harmless = Number(stats.harmless || 0);
  const undetected = Number(stats.undetected || 0);
  const timeout = Number(stats.timeout || 0);
  const total = malicious + suspicious + harmless + undetected + timeout;
  const scanTimestamp = Number(attributes.last_analysis_date || 0);
  const scanDate = scanTimestamp ? new Date(scanTimestamp * 1000).toLocaleString("ko-KR") : "";
  const ageDays = scanTimestamp ? Math.max(0, Math.floor((Date.now() - scanTimestamp * 1000) / 86_400_000)) : null;
  const engines = extractVirusTotalEngineResults(attributes.last_analysis_results);
  const flaggedEngines = engines.filter(isVirusTotalDetection);
  const statsSummary = { malicious, suspicious, harmless, undetected, timeout, total };
  const suffix = scanDate ? ` Last analysis: ${scanDate}.` : "";
  const sharedContext = {
    ageDays,
    engines: flaggedEngines,
    insights: buildVirusTotalInsights({
      ageDays,
      flaggedEngines,
      malicious,
      scanDate,
      suspicious,
      total,
    }),
    scanDate,
    scanTimestamp,
    stats: statsSummary,
  };

  if (malicious > 0) {
    if (isWeakVirusTotalDetection({ malicious, suspicious, total })) {
      return {
        detail: `VirusTotal에서 ${total || "여러"}개 엔진 중 ${malicious}개만 이 URL을 악성으로 분류했고 ${suspicious}개가 의심으로 분류했습니다. 단일 엔진 또는 낮은 비율의 탐지는 확정 악성이 아니라 주의 신호로 반영합니다.${suffix}`,
        label: "VirusTotal 단일 엔진 탐지",
        matches: [{ malicious, suspicious, harmless, undetected, total }],
        provider: "VirusTotal",
        severity: "low",
        status: "suspicious",
        tone: "warn",
        ...sharedContext,
      };
    }

    return {
      detail: `VirusTotal에서 ${total || "여러"}개 엔진 중 ${malicious}개가 이 URL을 악성으로, ${suspicious}개가 의심으로 분류했습니다. 차단을 권장합니다.${suffix}`,
      label: "VirusTotal 위협 탐지",
      matches: [{ malicious, suspicious, harmless, undetected, total }],
      provider: "VirusTotal",
      status: "match",
      tone: "danger",
      ...sharedContext,
    };
  }

  if (suspicious > 0) {
    return {
      detail: `VirusTotal에서 악성으로 확정되지는 않았지만 ${total || "여러"}개 엔진 중 ${suspicious}개가 의심으로 분류했습니다.${suffix}`,
      label: "VirusTotal 의심 결과",
      matches: [{ malicious, suspicious, harmless, undetected, total }],
      provider: "VirusTotal",
      status: "suspicious",
      tone: "warn",
      ...sharedContext,
    };
  }

  return {
    detail: `VirusTotal에서 악성 또는 의심 탐지는 보고되지 않았습니다. 통계: 악성 ${malicious}, 의심 ${suspicious}, 무해 ${harmless}, 미탐지 ${undetected}.${suffix}`,
    label: "VirusTotal 미탐지",
    matches: [],
    provider: "VirusTotal",
    status: "clean",
    tone: "safe",
    ...sharedContext,
  };
}

function isWeakVirusTotalDetection({ malicious, suspicious, total }) {
  const flagged = Number(malicious || 0) + Number(suspicious || 0);
  const maliciousCount = Number(malicious || 0);
  const totalCount = Number(total || 0);
  const maliciousRatio = totalCount > 0 ? maliciousCount / totalCount : maliciousCount > 0 ? 1 : 0;

  return maliciousCount > 0 && maliciousCount <= 1 && flagged <= 2 && totalCount >= 20 && maliciousRatio < 0.05;
}

function extractVirusTotalEngineResults(lastAnalysisResults = {}) {
  return Object.entries(lastAnalysisResults || {})
    .map(([name, result]) => ({
      category: String(result?.category || "unknown"),
      engineName: String(result?.engine_name || name),
      method: String(result?.method || ""),
      result: result?.result ? String(result.result) : "",
    }))
    .filter((result) => result.engineName);
}

function isVirusTotalDetection(engineResult) {
  return engineResult.category === "malicious" || engineResult.category === "suspicious";
}

function buildVirusTotalInsights({ ageDays, flaggedEngines, malicious, scanDate, suspicious, total }) {
  const insights = [];

  if (malicious > 0) {
    insights.push(`${malicious} engine(s) classified this URL as malicious.`);
  } else if (suspicious > 0) {
    insights.push(`${suspicious} engine(s) classified this URL as suspicious, so manual verification is recommended.`);
  } else if (total > 0) {
    insights.push(`${total} engine(s) were checked without malicious or suspicious detections.`);
  }

  if (flaggedEngines.length > 0) {
    const engineSummary = flaggedEngines
      .slice(0, 3)
      .map((engine) => `${engine.engineName}${engine.result ? ` (${engine.result})` : ""}`)
      .join(", ");
    insights.push(`Visible evidence: ${engineSummary}.`);
  }

  if (scanDate && ageDays !== null) {
    if (ageDays >= 180) {
      insights.push(`The last analysis is ${ageDays.toLocaleString("ko-KR")} day(s) old, so a newer review may be needed.`);
    } else {
      insights.push(`The latest available analysis was ${scanDate}.`);
    }
  }

  return insights;
}

function createVirusTotalUrlId(url) {
  return encodeBase64Url(url);
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof btoa === "function") {
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  throw new Error("No base64 encoder is available in this runtime.");
}

async function checkOpenPhish(url, config) {
  const normalizedUrl = normalizeUrlForMatch(url);
  const cacheKey = `openphish:${normalizedUrl}`;
  const cached = reputationCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.reputation, cached: true };
  }

  try {
    const feed = await getOpenPhishFeed(config);
    const exactMatch = isOpenPhishFeedMatch(feed, normalizedUrl);
    const reputation = exactMatch
      ? {
          detail: "이 URL은 공개 OpenPhish 피드의 항목과 정확히 일치합니다.",
          matches: [{ url, source: config.openPhishFeedUrl }],
          provider: "OpenPhish",
          status: "match",
          tone: "danger",
        }
      : {
          detail: `공개 OpenPhish 피드(${feed.count.toLocaleString("ko-KR")}개 항목)에서 일치하는 피싱 URL을 찾지 못했습니다.`,
          matches: [],
          provider: "OpenPhish",
          status: "clean",
          tone: "safe",
        };

    reputation.label = exactMatch ? "OpenPhish 위협 일치" : "OpenPhish 미탐지";
    reputationCache.set(cacheKey, { createdAt: Date.now(), reputation });
    return reputation;
  } catch (error) {
    return {
      detail: `Network error while querying OpenPhish: ${error.message}`,
      label: "Reputation feed connection failed",
      provider: "OpenPhish",
      status: "error",
      tone: "warn",
    };
  }
}

async function getOpenPhishFeed(config) {
  if (
    openPhishFeedCache &&
    openPhishFeedCache.feedUrl === config.openPhishFeedUrl &&
    Date.now() - openPhishFeedCache.createdAt < CACHE_TTL_MS
  ) {
    return openPhishFeedCache.feed;
  }

  const response = await fetch(config.openPhishFeedUrl, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "LinkGuardAI/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`OpenPhish response error (${response.status})`);
  }

  const text = await response.text();
  const feed = buildOpenPhishFeed(text);
  openPhishFeedCache = { createdAt: Date.now(), feed, feedUrl: config.openPhishFeedUrl };
  return feed;
}

async function getSecurityCases(config) {
  if (securityCaseCache && Date.now() - securityCaseCache.createdAt < SECURITY_CASE_CACHE_TTL_MS) {
    return securityCaseCache.cases;
  }

  const response = await fetch(config.kisaSecurityRssUrl, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
      "User-Agent": "LinkGuardAI/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`KISA security RSS response error (${response.status})`);
  }

  const text = await response.text();
  const cases = parseKisaSecurityCases(text).slice(0, 5);

  if (cases.length === 0) {
    throw new Error("No displayable security alerts were found in the KISA RSS feed.");
  }

  securityCaseCache = { cases, createdAt: Date.now() };
  return cases;
}

export function parseKisaSecurityCases(xmlText) {
  return [...String(xmlText || "").matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map((match) => parseRssItem(match[0]))
    .filter((item) => item.text);
}

function parseRssItem(itemXml) {
  const title = decodeXmlText(readXmlTag(itemXml, "title")).trim();
  const link = decodeXmlText(readXmlTag(itemXml, "link")).trim();
  const pubDate = decodeXmlText(readXmlTag(itemXml, "pubDate") || readXmlTag(itemXml, "dc:date")).trim();

  return {
    actions: [
      "Verify the alert through the official organization channel.",
      "Do not enter credentials or payment information from message links.",
      "Report suspicious messages to the relevant support or security channel.",
    ],
    date: formatSecurityCaseDate(pubDate),
    impact:
      "Depending on the campaign, users may be asked to enter personal data, credentials, authentication codes, or payment details.",
    source: "KISA Boho",
    sourceUrl: link || DEFAULT_KISA_SECURITY_RSS_URL,
    summary:
      "This is a recent public security notice. Treat related messages and links cautiously until verified from an official source.",
    text: title,
  };
}

function readXmlTag(xmlText, tagName) {
  const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(xmlText || "").match(new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i"));
  return match?.[1]?.trim() || "";
}

function decodeXmlText(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function formatSecurityCaseDate(value) {
  const dateMatch = String(value || "").match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);

  if (dateMatch) {
    const [, year, month, day] = dateMatch;
    return `${year}.${month.padStart(2, "0")}.${day.padStart(2, "0")}`;
  }

  const parsedDate = new Date(value);

  if (!Number.isNaN(parsedDate.getTime())) {
    return formatShortDate(parsedDate);
  }

  return "";
}

function formatShortDate(date) {
  return `${date.getFullYear()}.${`${date.getMonth() + 1}`.padStart(2, "0")}.${`${date.getDate()}`.padStart(2, "0")}`;
}

export function buildOpenPhishFeed(text) {
  const urls = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizedUrls = new Set(urls.map(normalizeUrlForMatch).filter(Boolean));

  return { count: normalizedUrls.size, normalizedUrls };
}

export function isOpenPhishFeedMatch(feed, rawUrl) {
  return Boolean(feed?.normalizedUrls?.has(normalizeUrlForMatch(rawUrl)));
}

export function normalizeUrlForMatch(rawUrl) {
  try {
    const parsedUrl = new URL(rawUrl);
    parsedUrl.hash = "";
    parsedUrl.hostname = parsedUrl.hostname.toLowerCase();
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, "") || "/";
    return parsedUrl.toString().replace(/\/$/, "");
  } catch {
    return String(rawUrl || "").trim().toLowerCase().replace(/\/+$/, "");
  }
}

async function readJsonBody(request) {
  const body = await request.text();

  if (new TextEncoder().encode(body).byteLength > REQUEST_LIMIT_BYTES) {
    return Promise.reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
  }

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return Promise.reject(Object.assign(new Error("Invalid JSON"), { statusCode: 400 }));
  }
}

function sendJson(statusCode, payload) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status: statusCode,
  });
}
