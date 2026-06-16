import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { Readable } from "node:stream";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleAdminReports as handleCloudflareAdminReports,
  handleMyReports as handleCloudflareMyReports,
  handleReportUrl as handleCloudflareReportUrl,
} from "./src/cloudflare/communityReports.js";
import {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthCreditPurchase,
  handleAuthCreditUse,
  handleAuthPlan,
  handleAuthSession,
  handleAuthSignup,
  handleAuthWallet,
  handleAuthWalletDeposit,
} from "./src/cloudflare/authApi.js";
import { handleAnalyzeUrl as handleCloudflareAnalyzeUrl } from "./src/cloudflare/linkguardApi.js";
import { analyzeUrl } from "./src/lib/linkRiskAnalyzer.js";
import {
  defaultGeminiImageModel,
  defaultImageModel,
  generateSecurityComicImages,
} from "./src/lib/securityComicImageApi.js";
import { createLocalAuthDb } from "./src/server/localAuthDb.js";
import { createLocalCommunityDb } from "./src/server/localCommunityDb.js";
import {
  captureWebsiteScreenshot,
  createFixedWindowRateLimiter,
  isSafeScreenshotFileName,
} from "./src/server/screenshotService.js";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = resolve(ROOT_DIR, "dist");
const SCREENSHOT_DIR = resolve(ROOT_DIR, "screenshots");
const SCREENSHOT_PUBLIC_PATH = "/screenshots";

loadLocalEnv();

const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const REQUESTED_PORT = Number(process.env.PORT || 5173);
const SCREENSHOT_SERVICE_URL = normalizeBaseUrl(process.env.SCREENSHOT_SERVICE_URL);
const SCREENSHOT_SERVICE_TOKEN = process.env.SCREENSHOT_SERVICE_TOKEN || "";
const PORT_WAS_EXPLICIT = Boolean(process.env.PORT);
const IS_DEV = process.argv.includes("--dev");
const CACHE_TTL_MS = 10 * 60 * 1000;
const SECURITY_CASE_CACHE_TTL_MS = 30 * 60 * 1000;
const OPENPHISH_FEED_URL = process.env.OPENPHISH_FEED_URL || "https://openphish.com/feed.txt";
const KISA_SECURITY_RSS_URL = process.env.KISA_SECURITY_RSS_URL || "https://www.boho.or.kr/kr/rss.do?bbsId=B0000133";
const REQUEST_LIMIT_BYTES = 16 * 1024;
const VIRUSTOTAL_API_BASE_URL = "https://www.virustotal.com/api/v3";
const VIRUSTOTAL_API_KEY = process.env.VIRUSTOTAL_API_KEY || "";
const VIRUSTOTAL_SUBMIT_UNKNOWN = process.env.VIRUSTOTAL_SUBMIT_UNKNOWN === "true";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || defaultImageModel;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || defaultGeminiImageModel;
const IMAGE_PROVIDER = process.env.IMAGE_PROVIDER || "openai";
const COMIC_REQUEST_LIMIT_BYTES = 36 * 1024 * 1024;
const LOCAL_AUTH_DB_PATH = process.env.LOCAL_AUTH_DB_PATH || resolve(ROOT_DIR, ".wrangler", "local-auth-db.json");
const LOCAL_COMMUNITY_DB_PATH =
  process.env.LOCAL_COMMUNITY_DB_PATH || resolve(ROOT_DIR, ".wrangler", "local-community-db.json");

const reputationCache = new Map();
const localAuthDb = createLocalAuthDb(LOCAL_AUTH_DB_PATH);
const localCommunityDb = createLocalCommunityDb(LOCAL_COMMUNITY_DB_PATH, localAuthDb);
const screenshotRateLimiter = createFixedWindowRateLimiter({
  max: readPositiveInt(process.env.SCREENSHOT_RATE_LIMIT_MAX, 10),
  windowMs: readPositiveInt(process.env.SCREENSHOT_RATE_LIMIT_WINDOW_MS, 60_000),
});
let openPhishFeedCache = null;
let securityCaseCache = null;
let vite = null;

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${REQUESTED_PORT}`}`);

    if (requestUrl.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        reputationProvider: VIRUSTOTAL_API_KEY ? "VirusTotal + OpenPhish" : "OpenPhish",
        reputationFeedConfigured: Boolean(OPENPHISH_FEED_URL),
        virusTotalConfigured: Boolean(VIRUSTOTAL_API_KEY),
      });
      return;
    }

    if (requestUrl.pathname === "/api/analyze-url") {
      await handleAnalyzeUrl(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/screenshot") {
      await handleScreenshot(request, response);
      return;
    }

    if (requestUrl.pathname.startsWith("/api/auth/")) {
      await handleAuthRequest(request, response, requestUrl.pathname);
      return;
    }

    if (requestUrl.pathname === "/api/report-url") {
      await handleReportUrl(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/admin/reports") {
      await handleAdminReports(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/my/reports") {
      await handleMyReports(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/security-cases") {
      await handleSecurityCases(response);
      return;
    }

    if (requestUrl.pathname === "/api/security-comic") {
      await handleSecurityComic(request, response);
      return;
    }

    if (requestUrl.pathname.startsWith(`${SCREENSHOT_PUBLIC_PATH}/`)) {
      if (SCREENSHOT_SERVICE_URL) {
        await proxyScreenshotAsset(request, response, requestUrl);
        return;
      }

      await serveScreenshotAsset(request, response, requestUrl);
      return;
    }

    if (vite) {
      vite.middlewares(request, response, () => {
        sendText(response, 404, "Not found");
      });
      return;
    }

    serveStaticAsset(request, response, requestUrl);
  } catch (error) {
    console.error(error);
    sendJson(response, error.statusCode || 500, { error: error.message || "Internal server error" });
  }
});

if (isDirectRun()) {
  await startServer();
}

async function startServer() {
  const selectedPort = await resolvePort(REQUESTED_PORT);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${selectedPort} is already in use. Set PORT to another value or stop the existing server.`);
    } else {
      console.error(error);
    }
    process.exit(1);
  });

  if (IS_DEV) {
    vite = await createViteMiddleware(server);
  }

  server.listen(selectedPort, HOST, () => {
    const modeLabel = IS_DEV ? "dev" : "preview";
    console.log(`LinkGuard ${modeLabel} server running at http://${HOST}:${selectedPort}/`);
  });
}

async function handleAnalyzeUrl(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readJsonBody(request);
  const proxyRequest = new Request(`http://${HOST}/api/analyze-url`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const proxyResponse = await handleCloudflareAnalyzeUrl(proxyRequest, createLocalEnv());
  const payload = await proxyResponse.text();
  const headers = Object.fromEntries(proxyResponse.headers.entries());

  if (proxyResponse.ok && process.env.SCREENSHOT_ANALYSIS_DISABLED !== "true") {
    const enrichedPayload = await enrichAnalysisPayloadWithScreenshot(payload, body, request);
    response.writeHead(proxyResponse.status, headers);
    response.end(enrichedPayload);
    return;
  }

  response.writeHead(proxyResponse.status, headers);
  response.end(payload);
  return;

  const url = typeof body.url === "string" ? body.url : "";
  const mode = body.mode === "expert" ? "expert" : "normal";
  const localAnalysis = analyzeUrl(url, { mode });

  if (!shouldCheckReputation(localAnalysis)) {
    sendJson(response, 200, attachReputation(localAnalysis, {
      detail: "웹 URL이 아니거나 분석 가능한 주소가 아니라 평판 조회를 건너뛰었습니다.",
      label: "평판 DB 조회 제외",
      provider: "OpenPhish",
      status: "skipped",
      tone: "blue",
    }));
    return;
  }

  const reputation = await checkReputation(localAnalysis.displayUrl);
  sendJson(response, 200, attachReputation(localAnalysis, reputation));
}

async function enrichAnalysisPayloadWithScreenshot(payload, body, request) {
  let analysis;
  try {
    analysis = JSON.parse(payload);
  } catch {
    return payload;
  }

  const requestedUrl = typeof body.url === "string" ? body.url : "";
  const screenshotTargetUrl = selectScreenshotTargetUrl(analysis, requestedUrl);
  if (!screenshotTargetUrl || ["blocked", "idle", "invalid"].includes(analysis.verdict)) {
    analysis.screenshot = buildSkippedScreenshotResult(requestedUrl);
    return JSON.stringify(analysis);
  }

  const rateLimit = screenshotRateLimiter.check(getClientRateLimitKey(request));
  if (!rateLimit.allowed) {
    analysis.screenshot = {
      error: "스크린샷 캡처 요청이 많아 일시적으로 제한되었습니다.",
      inputUrl: requestedUrl,
      success: false,
    };
    return JSON.stringify(analysis);
  }

  const screenshot = await requestScreenshotCapture({
    device: body.screenshotDevice === "mobile" ? "mobile" : "desktop",
    fullPage: Boolean(body.fullPageScreenshot),
    url: screenshotTargetUrl,
  });

  analysis.screenshot = sanitizeScreenshotResult({
    ...screenshot,
    inputUrl: requestedUrl,
    redirected:
      screenshot.success && Boolean(screenshot.finalUrl) ? normalizeUrlForCompare(requestedUrl) !== normalizeUrlForCompare(screenshot.finalUrl) : false,
  });
  return JSON.stringify(analysis);
}

async function handleScreenshot(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const rateLimit = screenshotRateLimiter.check(getClientRateLimitKey(request));
  if (!rateLimit.allowed) {
    sendJson(response, 429, {
      error: "스크린샷 캡처 요청이 많아 잠시 후 다시 시도해주세요.",
      retryAfterMs: rateLimit.retryAfterMs,
      success: false,
    });
    return;
  }

  const body = await readJsonBody(request);
  const url = typeof body.url === "string" ? body.url : "";
  const result = await requestScreenshotCapture({
    device: body.device === "mobile" ? "mobile" : "desktop",
    fullPage: Boolean(body.fullPage),
    url,
  });

  sendJson(response, result.success ? 200 : 400, sanitizeScreenshotResult(result));
}

async function requestScreenshotCapture(payload) {
  if (!SCREENSHOT_SERVICE_URL) {
    return captureWebsiteScreenshot({
      ...payload,
      publicPath: SCREENSHOT_PUBLIC_PATH,
      screenshotDir: SCREENSHOT_DIR,
    });
  }

  try {
    const headers = {
      "Content-Type": "application/json",
    };
    if (SCREENSHOT_SERVICE_TOKEN) {
      headers.Authorization = `Bearer ${SCREENSHOT_SERVICE_TOKEN}`;
    }

    const serviceResponse = await fetch(`${SCREENSHOT_SERVICE_URL}/api/screenshot`, {
      body: JSON.stringify(payload),
      headers,
      method: "POST",
      signal: createScreenshotServiceSignal(),
    });
    const text = await serviceResponse.text();
    const result = text ? JSON.parse(text) : {};

    if (!serviceResponse.ok && !result.error) {
      result.error = `스크린샷 서비스 응답 오류: ${serviceResponse.status}`;
    }

    return result;
  } catch (error) {
    return {
      error: "스크린샷 캡처 실패 또는 보안상 차단된 URL입니다.",
      inputUrl: payload.url || "",
      reason: error.message,
      success: false,
    };
  }
}

async function serveScreenshotAsset(request, response, requestUrl) {
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    sendText(response, 405, "Method not allowed");
    return;
  }

  const fileName = decodeURIComponent(requestUrl.pathname.slice(`${SCREENSHOT_PUBLIC_PATH}/`.length));
  if (!isSafeScreenshotFileName(fileName)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const filePath = resolve(SCREENSHOT_DIR, fileName);
  if (!isPathInsideDirectory(SCREENSHOT_DIR, filePath) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    sendText(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "private, max-age=86400",
    "Content-Disposition": `inline; filename="${fileName}"`,
    "Content-Type": "image/png",
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

async function proxyScreenshotAsset(request, response, requestUrl) {
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    sendText(response, 405, "Method not allowed");
    return;
  }

  const fileName = decodeURIComponent(requestUrl.pathname.slice(`${SCREENSHOT_PUBLIC_PATH}/`.length));
  if (!isSafeScreenshotFileName(fileName)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const headers = {};
  if (SCREENSHOT_SERVICE_TOKEN) {
    headers.Authorization = `Bearer ${SCREENSHOT_SERVICE_TOKEN}`;
  }

  const serviceResponse = await fetch(`${SCREENSHOT_SERVICE_URL}${requestUrl.pathname}`, {
    headers,
    method: request.method,
    signal: createScreenshotServiceSignal(),
  });

  if (!serviceResponse.ok || !serviceResponse.body) {
    sendText(response, serviceResponse.status || 404, "Not found");
    return;
  }

  response.writeHead(serviceResponse.status, {
    "Cache-Control": serviceResponse.headers.get("cache-control") || "private, max-age=86400",
    "Content-Disposition": serviceResponse.headers.get("content-disposition") || `inline; filename="${fileName}"`,
    "Content-Type": "image/png",
    "X-Content-Type-Options": "nosniff",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  Readable.fromWeb(serviceResponse.body).pipe(response);
}

function selectScreenshotTargetUrl(analysis, requestedUrl) {
  return analysis?.redirectTrace?.finalUrl || analysis?.displayUrl || requestedUrl;
}

function buildSkippedScreenshotResult(inputUrl) {
  return {
    error: "분석 가능한 HTTP(S) URL이 아니어서 스크린샷 캡처를 건너뛰었습니다.",
    inputUrl,
    success: false,
  };
}

function sanitizeScreenshotResult(result) {
  if (!result?.success) {
    return {
      error: result?.error || "스크린샷 캡처 실패 또는 보안상 차단된 URL입니다.",
      inputUrl: result?.inputUrl || "",
      success: false,
    };
  }

  return {
    capturedAt: result.capturedAt,
    device: result.device,
    finalUrl: result.finalUrl,
    fullPage: Boolean(result.fullPage),
    inputUrl: result.inputUrl,
    redirected: Boolean(result.redirected),
    screenshotKey: result.screenshotKey || "",
    screenshotUrl: result.screenshotUrl,
    storageDriver: result.storageDriver || "local",
    success: true,
  };
}

function getClientRateLimitKey(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0].split(",")[0].trim();
  }

  return String(forwardedFor || request.socket?.remoteAddress || "local").split(",")[0].trim();
}

function normalizeUrlForCompare(value) {
  try {
    return new URL(value).href;
  } catch {
    return String(value || "").trim();
  }
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function createScreenshotServiceSignal() {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(readPositiveInt(process.env.SCREENSHOT_SERVICE_TIMEOUT_MS, 20_000))
    : undefined;
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function handleAuthRequest(request, response, pathname) {
  const proxyRequest = createProxyRequest(request, pathname);
  const authEnv = {
    ...process.env,
    DB: process.env.DB || localAuthDb,
  };
  const handlers = {
    "/api/auth/login": handleAuthLogin,
    "/api/auth/logout": handleAuthLogout,
    "/api/auth/credits/purchase": handleAuthCreditPurchase,
    "/api/auth/credits/use": handleAuthCreditUse,
    "/api/auth/plan": handleAuthPlan,
    "/api/auth/session": handleAuthSession,
    "/api/auth/signup": handleAuthSignup,
    "/api/auth/wallet": handleAuthWallet,
    "/api/auth/wallet/deposit": handleAuthWalletDeposit,
  };
  const handler = handlers[pathname];

  if (!handler) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const proxyResponse = await handler(proxyRequest, authEnv);
  const payload = await proxyResponse.text();

  response.writeHead(proxyResponse.status, Object.fromEntries(proxyResponse.headers.entries()));
  response.end(payload);
}

async function handleReportUrl(request, response) {
  const proxyRequest = createProxyRequest(request, "/api/report-url");
  const proxyResponse = await handleCloudflareReportUrl(proxyRequest, createLocalEnv());
  const payload = await proxyResponse.text();

  response.writeHead(proxyResponse.status, Object.fromEntries(proxyResponse.headers.entries()));
  response.end(payload);
}

async function handleAdminReports(request, response) {
  const proxyRequest = createProxyRequest(request, "/api/admin/reports");
  const proxyResponse = await handleCloudflareAdminReports(proxyRequest, createLocalEnv());
  const payload = await proxyResponse.text();

  response.writeHead(proxyResponse.status, Object.fromEntries(proxyResponse.headers.entries()));
  response.end(payload);
}

async function handleMyReports(request, response) {
  const proxyRequest = createProxyRequest(request, "/api/my/reports");
  const proxyResponse = await handleCloudflareMyReports(proxyRequest, createLocalEnv());
  const payload = await proxyResponse.text();

  response.writeHead(proxyResponse.status, Object.fromEntries(proxyResponse.headers.entries()));
  response.end(payload);
}

function createProxyRequest(request, pathname) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  return new Request(`http://${HOST}${pathname}`, {
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request,
    duplex: "half",
    headers,
    method: request.method,
  });
}

function createLocalEnv() {
  return {
    ...process.env,
    DB: process.env.DB || localCommunityDb,
    REPORT_EVIDENCE_INLINE: process.env.REPORT_EVIDENCE_INLINE || "true",
  };
}

async function handleSecurityCases(response) {
  try {
    const cases = await getSecurityCases();
    sendJson(response, 200, {
      cases,
      sourceLabel: "KISA 보호나라 보안공지 RSS",
      sourcePageUrl: "https://www.boho.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020",
      sourceUrl: KISA_SECURITY_RSS_URL,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    sendJson(response, 502, {
      error: error.message || "보안공지 RSS를 불러오지 못했습니다.",
      sourceLabel: "KISA 보호나라 보안공지 RSS",
      sourcePageUrl: "https://www.boho.or.kr/kr/bbs/list.do?bbsId=B0000133&menuNo=205020",
      sourceUrl: KISA_SECURITY_RSS_URL,
    });
  }
}

async function handleSecurityComic(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const body = await readJsonBody(request, { maxBytes: COMIC_REQUEST_LIMIT_BYTES });
  const result = await generateSecurityComicImages(body, {
    apiKey: OPENAI_API_KEY,
    geminiApiKey: GEMINI_API_KEY,
    geminiImageModel: GEMINI_IMAGE_MODEL,
    imageModel: OPENAI_IMAGE_MODEL,
    provider: IMAGE_PROVIDER,
  });
  sendJson(response, 200, result);
}

function shouldCheckReputation(analysis) {
  return Boolean(
    analysis.displayUrl &&
      /^https?:\/\//i.test(analysis.displayUrl) &&
      !["idle", "invalid"].includes(analysis.verdict),
  );
}

async function checkReputation(url) {
  const virusTotalReputation = VIRUSTOTAL_API_KEY ? await checkVirusTotal(url) : null;
  if (virusTotalReputation?.status === "match") {
    return virusTotalReputation;
  }

  const openPhishReputation = await checkOpenPhish(url);
  if (openPhishReputation.status === "match") {
    return openPhishReputation;
  }

  return virusTotalReputation || openPhishReputation;
}

async function checkVirusTotal(url) {
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
        "x-apikey": VIRUSTOTAL_API_KEY,
      },
    });

    if (response.status === 404) {
      const reputation = VIRUSTOTAL_SUBMIT_UNKNOWN
        ? await submitVirusTotalUrl(url)
        : {
            detail:
              "VirusTotal에 기존 URL 리포트가 없습니다. VIRUSTOTAL_SUBMIT_UNKNOWN=true를 설정하면 미등록 URL을 VirusTotal에 제출할 수 있습니다.",
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
        detail: `VirusTotal 응답 오류 (${response.status}): ${message.slice(0, 180)}`,
        label: "VirusTotal 오류",
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
      detail: `VirusTotal 조회 중 네트워크 오류가 발생했습니다: ${error.message}`,
      label: "VirusTotal 연결 실패",
      provider: "VirusTotal",
      status: "error",
      tone: "warn",
    };
  }
}

async function submitVirusTotalUrl(url) {
  const body = new URLSearchParams({ url });
  const response = await fetch(`${VIRUSTOTAL_API_BASE_URL}/urls`, {
    body,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-apikey": VIRUSTOTAL_API_KEY,
    },
    method: "POST",
  });

  if (!response.ok) {
    const message = await response.text();
    return {
      detail: `VirusTotal 분석 제출 오류 (${response.status}): ${message.slice(0, 180)}`,
      label: "VirusTotal 제출 실패",
      provider: "VirusTotal",
      status: "error",
      tone: "warn",
    };
  }

  const data = await response.json();
  return {
    analysisId: data?.data?.id,
    detail: "기존 리포트가 없어 VirusTotal에 URL 분석을 제출했습니다. 잠시 후 다시 조회하면 결과가 반영됩니다.",
    label: "VirusTotal 분석 제출됨",
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
  const statsText = `악성 ${malicious}개, 의심 ${suspicious}개, 무해 ${harmless}개, 미탐지 ${undetected}개`;
  const suffix = scanDate ? ` 마지막 분석: ${scanDate}.` : "";
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
    return {
      detail: `VirusTotal 보안 엔진 ${total || "여러"}개 중 악성 ${malicious}개, 의심 ${suspicious}개가 탐지되었습니다. 엔진별 분류 라벨을 근거로 차단을 권장합니다.${suffix}`,
      label: "VirusTotal 위험 탐지",
      matches: [{ malicious, suspicious, harmless, undetected, total }],
      provider: "VirusTotal",
      status: "match",
      tone: "danger",
      ...sharedContext,
    };
  }

  if (suspicious > 0) {
    return {
      detail: `악성으로 확정한 엔진은 없지만 VirusTotal 보안 엔진 ${total || "여러"}개 중 ${suspicious}개가 의심 URL로 분류했습니다. 엔진 내부 판단 로직은 공개되지 않아, 제공 가능한 근거는 엔진명과 결과 라벨입니다.${suffix}`,
      label: "VirusTotal 의심 탐지",
      matches: [{ malicious, suspicious, harmless, undetected, total }],
      provider: "VirusTotal",
      status: "suspicious",
      tone: "warn",
      ...sharedContext,
    };
  }

  return {
    detail: `VirusTotal 최신 리포트에서 악성 또는 의심 탐지가 없습니다. ${statsText}.${suffix}`,
    matches: [],
    provider: "VirusTotal",
    label: "VirusTotal 미탐지",
    status: "clean",
    tone: "safe",
    ...sharedContext,
  };
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
    insights.push(`${malicious}개 엔진이 악성으로 분류해 평판 기반 차단 기준에 해당합니다.`);
  } else if (suspicious > 0) {
    insights.push(`악성 확정은 0개지만 ${suspicious}개 엔진이 의심으로 분류해 수동 검증이 필요합니다.`);
  } else if (total > 0) {
    insights.push(`${total}개 엔진 기준으로 악성 또는 의심 탐지는 확인되지 않았습니다.`);
  }

  if (flaggedEngines.length > 0) {
    const engineSummary = flaggedEngines
      .slice(0, 3)
      .map((engine) => `${engine.engineName}${engine.result ? ` (${engine.result})` : ""}`)
      .join(", ");
    insights.push(`표시 가능한 근거는 ${engineSummary}의 엔진별 결과 라벨입니다.`);
  }

  if (scanDate && ageDays !== null) {
    if (ageDays >= 180) {
      insights.push(`마지막 분석 후 ${ageDays.toLocaleString("ko-KR")}일이 지나 최신 재분석이 권장됩니다.`);
    } else {
      insights.push(`마지막 분석 시각은 ${scanDate}이며, 현재 리포트 기준으로 표시합니다.`);
    }
  }

  return insights;
}

function createVirusTotalUrlId(url) {
  return Buffer.from(url).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function checkOpenPhish(url) {
  const normalizedUrl = normalizeUrlForMatch(url);
  const cacheKey = `openphish:${normalizedUrl}`;
  const cached = reputationCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { ...cached.reputation, cached: true };
  }

  try {
    const feed = await getOpenPhishFeed();
    const exactMatch = isOpenPhishFeedMatch(feed, normalizedUrl);
    const reputation = exactMatch
      ? {
          detail: "OpenPhish 공개 피드에 등록된 피싱 URL과 일치합니다.",
          matches: [{ url, source: OPENPHISH_FEED_URL }],
          provider: "OpenPhish",
          status: "match",
          tone: "danger",
        }
      : {
          detail: `OpenPhish 공개 피드 ${feed.count.toLocaleString("ko-KR")}건에서 일치하는 피싱 URL이 발견되지 않았습니다.`,
          matches: [],
          provider: "OpenPhish",
          status: "clean",
          tone: "safe",
        };

    reputation.label = exactMatch ? "OpenPhish 위험 일치" : "OpenPhish 미탐지";
    reputationCache.set(cacheKey, { createdAt: Date.now(), reputation });
    return reputation;
  } catch (error) {
    return {
      detail: `OpenPhish 피드 조회 중 네트워크 오류가 발생했습니다: ${error.message}`,
      label: "평판 DB 연결 실패",
      provider: "OpenPhish",
      status: "error",
      tone: "warn",
    };
  }
}

async function getOpenPhishFeed() {
  if (openPhishFeedCache && Date.now() - openPhishFeedCache.createdAt < CACHE_TTL_MS) {
    return openPhishFeedCache.feed;
  }

  const response = await fetch(OPENPHISH_FEED_URL, {
    headers: {
      Accept: "text/plain",
      "User-Agent": "LinkGuardAI/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`OpenPhish 응답 오류 (${response.status})`);
  }

  const text = await response.text();
  const feed = buildOpenPhishFeed(text);
  openPhishFeedCache = { createdAt: Date.now(), feed };
  return feed;
}

async function getSecurityCases() {
  if (securityCaseCache && Date.now() - securityCaseCache.createdAt < SECURITY_CASE_CACHE_TTL_MS) {
    return securityCaseCache.cases;
  }

  const response = await fetch(KISA_SECURITY_RSS_URL, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
      "User-Agent": "LinkGuardAI/0.1",
    },
  });

  if (!response.ok) {
    throw new Error(`KISA 보안공지 RSS 응답 오류 (${response.status})`);
  }

  const text = await response.text();
  const cases = parseKisaSecurityCases(text).slice(0, 5);

  if (cases.length === 0) {
    throw new Error("KISA 보안공지 RSS에서 표시할 사례를 찾지 못했습니다.");
  }

  securityCaseCache = { cases, createdAt: Date.now() };
  return cases;
}

export function parseKisaSecurityCases(xmlText) {
  return [...String(xmlText || "").matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map((match) => parseRssItem(match[0]))
    .filter((item) => item.text && isRelevantSecurityCase(item.text));
}

function parseRssItem(itemXml) {
  const title = decodeXmlText(readXmlTag(itemXml, "title")).trim();
  const link = decodeXmlText(readXmlTag(itemXml, "link")).trim();
  const pubDate = decodeXmlText(readXmlTag(itemXml, "pubDate") || readXmlTag(itemXml, "dc:date")).trim();
  const detail = buildSecurityCaseDetail(title);

  return {
    date: formatSecurityCaseDate(pubDate),
    ...detail,
    source: "KISA 보호나라",
    sourceUrl: link || KISA_SECURITY_RSS_URL,
    text: title,
  };
}

function buildSecurityCaseDetail(title) {
  const normalizedTitle = title.replace(/[“”"]/g, "");

  if (/여행|예약/.test(normalizedTitle)) {
    return {
      actions: ["예약 내역은 앱이나 공식 홈페이지에 직접 접속해 확인", "문자 링크에서 로그인이나 결제정보 입력 중단", "이미 입력했다면 비밀번호 변경과 카드사 확인"],
      impact: "예약 정보, 계정 로그인 정보, 결제 정보 입력을 요구하는 페이지로 이어질 수 있어 문자 속 링크 접근을 피해야 합니다.",
      summary: "여행 예약 플랫폼 해킹 이슈를 미끼로 예약 확인, 환불, 보상 안내처럼 보이는 문자를 보내고 링크 클릭을 유도하는 유형입니다.",
    };
  }

  if (/유류비|주유|중동/.test(normalizedTitle)) {
    return {
      actions: ["지원금 안내는 정부·지자체 공식 채널에서 직접 확인", "인증번호와 계좌 비밀번호 입력 금지", "의심 문자는 118 상담이나 KISA 보호나라에서 확인"],
      impact: "정부 지원금 신청 페이지처럼 보이게 만든 뒤 개인정보, 계좌 정보, 인증번호 입력을 요구할 수 있습니다.",
      summary: "사회적 이슈와 유류비 부담을 악용해 주유 지원금, 환급, 보조금 신청처럼 꾸민 문자로 사용자를 속이는 유형입니다.",
    };
  }

  if (/명절|스미싱|피싱|사기/.test(normalizedTitle)) {
    return {
      actions: ["문자 링크보다 공식 앱·홈페이지에서 직접 확인", "개인정보·인증번호 입력 전 발신 기관 검증", "출처 불명 앱 설치 파일 내려받기 금지"],
      impact: "긴급한 안내처럼 꾸며 악성 앱 설치, 계정 탈취, 금융 피해로 이어질 수 있습니다.",
      summary: "시기성 이슈나 익숙한 기관명을 악용해 문자·메일 속 링크 클릭을 유도하는 사이버 사기 유형입니다.",
    };
  }

  return {
    actions: ["공지 원문에서 영향 대상 확인", "링크·첨부파일 접근 전 공식 채널 검증", "의심 정황이 있으면 118 또는 보안 담당자에게 문의"],
    impact: "공지 내용에 따라 개인정보 유출, 악성코드 감염, 계정 탈취 등으로 이어질 수 있습니다.",
    summary: "KISA 보호나라 보안공지에서 확인된 최신 보안 주의 항목입니다.",
  };
}

function isRelevantSecurityCase(title) {
  return /스미싱|피싱|큐싱|사칭|악성|랜섬웨어|개인정보|해킹/i.test(title);
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

function attachReputation(analysis, reputation) {
  const result = structuredClone(analysis);
  result.mode = analysis.mode;
  result.reputation = reputation;
  result.signals = [
    {
      key: "reputation",
      label: `${reputation.provider || "평판 DB"} 평판`,
      tone: reputation.tone,
      value: reputation.status === "match" ? "위험" : reputation.status === "clean" ? "미탐지" : "확인 필요",
    },
    ...result.signals,
  ];

  if (reputation.status !== "match") {
    if (reputation.status === "suspicious") {
      const engineSummary = reputation.engines?.length
        ? ` 주요 근거는 ${reputation.engines
            .slice(0, 2)
            .map((engine) => `${engine.engineName}${engine.result ? ` (${engine.result})` : ""}`)
            .join(", ")}의 판정 라벨입니다.`
        : "";
      result.caption = "평판 DB 의심";
      result.evidence = [
        {
          detail: reputation.detail,
          label: `${reputation.provider || "평판 DB"} 의심 탐지`,
          points: 60,
        },
        ...result.evidence,
      ];
      result.explanation = `${result.displayHost}는 ${reputation.provider || "평판 DB"}에서 일부 보안 엔진이 의심 URL로 분류했습니다.${engineSummary} 개인정보 입력이나 파일 다운로드는 피하고 공식 채널에서 다시 확인하세요.`;
      result.recommendations = [
        "개인정보나 인증번호 입력을 멈추세요.",
        "공식 앱이나 직접 입력한 주소로 같은 내용을 확인하세요.",
        "이미 정보를 입력했다면 비밀번호 변경과 계정 활동 내역을 확인하세요.",
      ];
      result.score = Math.max(result.score, 60);
      result.scoreLabel = "평판 DB 의심 링크";
      result.statusLabel = "주의";
      result.tone = "warn";
      result.verdict = "suspicious";
    }

    return result;
  }

  const detail = reputation.detail || `${reputation.provider || "평판 DB"}에서 위험 URL로 확인되었습니다.`;
  const engineSummary = reputation.engines?.length
    ? ` 주요 근거는 ${reputation.engines
        .slice(0, 2)
        .map((engine) => `${engine.engineName}${engine.result ? ` (${engine.result})` : ""}`)
        .join(", ")}의 판정 라벨입니다.`
    : "";
  result.caption = "평판 DB 일치";
  result.evidence = [
    {
      detail,
      label: `${reputation.provider || "평판 DB"} 위험 일치`,
      points: 100,
    },
    ...result.evidence,
  ];
  result.explanation = `${result.displayHost}는 ${reputation.provider || "평판 DB"}에서 위험 URL로 확인되었습니다.${engineSummary} 휴리스틱 점수와 관계없이 링크를 열지 않는 것이 안전합니다.`;
  result.recommendations = [
    "링크를 열지 말고 즉시 삭제하거나 차단하세요.",
    "이미 열었다면 비밀번호 변경과 악성 앱 설치 여부를 확인하세요.",
    "계정, 카드, 인증번호를 입력했다면 해당 기관에 바로 신고하세요.",
    "공식 앱이나 직접 입력한 주소에서만 같은 내용을 확인하세요.",
  ];
  result.score = 100;
  result.scoreLabel = "평판 DB 위험 링크";
  result.statusLabel = "위험";
  result.tone = "danger";
  result.verdict = "malicious";

  return result;
}

async function readJsonBody(request, { maxBytes = REQUEST_LIMIT_BYTES } = {}) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxBytes) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
  }

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

async function createViteMiddleware(httpServer) {
  const { createServer: createViteServer } = await import("vite");

  return createViteServer({
    appType: "spa",
    server: {
      hmr: {
        server: httpServer,
      },
      middlewareMode: true,
    },
  });
}

async function resolvePort(startPort) {
  if (PORT_WAS_EXPLICIT) {
    const isAvailable = await isPortAvailable(startPort);

    if (!isAvailable) {
      console.error(`Port ${startPort} is already in use. Set PORT to another value or stop the existing server.`);
      process.exit(1);
    }

    return startPort;
  }

  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      if (port !== startPort) {
        console.warn(`Port ${startPort} is already in use. Using ${port} instead.`);
      }

      return port;
    }
  }

  console.error(`No available port found from ${startPort} to ${startPort + 19}.`);
  process.exit(1);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = createNetServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        probe.close(() => resolve(true));
      })
      .listen(port, HOST);
  });
}

function serveStaticAsset(request, response, requestUrl) {
  if (!["GET", "HEAD"].includes(request.method || "GET")) {
    sendText(response, 405, "Method not allowed");
    return;
  }

  if (!existsSync(DIST_DIR)) {
    sendText(response, 404, "dist 폴더가 없습니다. 먼저 npm.cmd run build를 실행하세요.");
    return;
  }

  const rawPathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const decodedPathname = decodeURIComponent(rawPathname);
  const requestedAssetPath = decodedPathname.replace(/^[/\\]+/, "");
  let filePath = resolve(DIST_DIR, requestedAssetPath);

  if (!isPathInsideDirectory(DIST_DIR, filePath)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST_DIR, "index.html");
  }

  response.writeHead(200, {
    "Content-Type": getContentType(filePath),
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

export function isPathInsideDirectory(rootDir, targetPath) {
  const relativePath = relative(resolve(rootDir), resolve(targetPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(text);
}

function getContentType(filePath) {
  const extension = extname(filePath);
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };

  return contentTypes[extension] || "application/octet-stream";
}

function loadLocalEnv() {
  for (const fileName of [".env", ".env.local"]) {
    const filePath = join(ROOT_DIR, fileName);

    if (!existsSync(filePath)) {
      continue;
    }

    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

function isDirectRun() {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url));
}
