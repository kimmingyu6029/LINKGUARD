import { analyzeUrl } from "../lib/linkRiskAnalyzer.js";

const AUTH_COOKIE = "linkguard_session";
const REQUEST_LIMIT_BYTES = 6 * 1024 * 1024;
const MAX_DESCRIPTION_LENGTH = 1200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REPORTS_PER_WINDOW = 5;
const REPORT_TYPES = new Set([
  "phishing",
  "smishing",
  "fake_shop",
  "account_takeover",
  "malicious_app",
  "malware_download",
  "investment_scam",
  "personal_info",
  "other",
]);
const REPORT_STATUSES = new Set([
  "pending",
  "under_review",
  "confirmed_suspicious",
  "confirmed_malicious",
  "rejected",
  "expired",
]);
const DEVELOPER_USERNAMES = new Set(["kimmingyu6029"]);
const IMAGE_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const BLOCKED_IMAGE_EXTENSIONS = new Set([".apk", ".exe", ".html", ".js", ".svg", ".zip"]);

export async function handleReportUrl(request, env = {}) {
  if (request.method !== "POST") {
    return sendJson(405, { error: "Method not allowed" });
  }

  const db = getCommunityDb(env, { optional: false });
  const body = await readReportBody(request);
  const reportType = normalizeReportType(body.reportType);
  const description = normalizeDescription(body.description);
  const privacyConfirmed = body.privacyConfirmed === true || body.privacyConfirmed === "true";

  if (!privacyConfirmed) {
    return sendJson(400, { error: "개인정보 입력 금지 안내에 동의해 주세요." });
  }

  if (!reportType) {
    return sendJson(400, { error: "피해 유형을 선택해 주세요." });
  }

  if (!description) {
    return sendJson(400, { error: "피해 내용을 간단히 설명해 주세요." });
  }

  const analyzedUrl = validateReportUrl(body.url);
  if (!analyzedUrl.ok) {
    return sendJson(400, { error: analyzedUrl.error });
  }

  const turnstile = await verifyTurnstileToken(body.turnstileToken, request, env);
  if (!turnstile.ok) {
    return sendJson(400, { error: turnstile.error });
  }

  const reporterIpHash = await hashReporterIp(getClientIp(request), env);
  const reporterUserId = await readReporterUserId(request, db);
  const urlHash = await sha256Hex(analyzedUrl.normalizedUrl);
  const now = new Date().toISOString();
  const rateLimitError = await checkReportRateLimits(db, {
    reporterIpHash,
    since: new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString(),
  });

  if (rateLimitError) {
    return sendJson(429, { error: rateLimitError });
  }

  let reportedUrl = await findReportedUrlByHash(db, urlHash);

  if (!reportedUrl) {
    reportedUrl = {
      confidence_score: 0,
      created_at: now,
      domain: analyzedUrl.domain,
      final_url: analyzedUrl.normalizedUrl,
      id: crypto.randomUUID(),
      normalized_url: analyzedUrl.normalizedUrl,
      original_url: analyzedUrl.originalUrl,
      report_count: 0,
      report_type: reportType,
      status: "pending",
      unique_reporters: 0,
      updated_at: now,
      url_hash: urlHash,
    };

    await db
      .prepare(
        `INSERT INTO reported_urls (
          id,
          original_url,
          normalized_url,
          final_url,
          domain,
          url_hash,
          report_type,
          report_count,
          unique_reporters,
          confidence_score,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        reportedUrl.id,
        reportedUrl.original_url,
        reportedUrl.normalized_url,
        reportedUrl.final_url,
        reportedUrl.domain,
        reportedUrl.url_hash,
        reportedUrl.report_type,
        reportedUrl.report_count,
        reportedUrl.unique_reporters,
        reportedUrl.confidence_score,
        reportedUrl.status,
        reportedUrl.created_at,
        reportedUrl.updated_at,
      )
      .run();
  }

  const duplicateSince = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const duplicate = await db
    .prepare(
      `SELECT id FROM report_events
      WHERE reported_url_id = ? AND reporter_ip_hash = ? AND created_at >= ?
      LIMIT 1`,
    )
    .bind(reportedUrl.id, reporterIpHash, duplicateSince)
    .first();

  if (duplicate) {
    return sendJson(409, { error: "같은 URL은 같은 네트워크에서 하루에 한 번만 신고할 수 있습니다." });
  }

  const evidenceImageUrl = await storeEvidenceImage(body.evidenceImage, env);
  const event = {
    createdAt: now,
    description,
    evidenceImageUrl,
    id: crypto.randomUUID(),
    reportedUrlId: reportedUrl.id,
    reportType,
    reporterIpHash,
    reporterUserId,
  };

  await db
    .prepare(
      `INSERT INTO report_events (
        id,
        reported_url_id,
        report_type,
        description,
        reporter_ip_hash,
        reporter_user_id,
        evidence_image_url,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      event.id,
      event.reportedUrlId,
      event.reportType,
      event.description,
      event.reporterIpHash,
      event.reporterUserId,
      event.evidenceImageUrl,
      event.createdAt,
    )
    .run();

  const refreshed = await refreshReportedUrlAggregate(db, reportedUrl.id);
  const communityReport = serializeCommunityReport(refreshed);

  return sendJson(201, {
    communityReport,
    report: {
      createdAt: event.createdAt,
      id: event.id,
      status: refreshed.status,
    },
  });
}

export async function handleAdminReports(request, env = {}) {
  const db = getCommunityDb(env, { optional: false });
  const session = await readDeveloperSession(request, db);

  if (!session) {
    return sendJson(403, { error: "개발자 계정만 신고 내역을 확인할 수 있습니다." });
  }

  if (request.method === "GET") {
    return sendJson(200, {
      reporters: await listAdminReporters(db),
    });
  }

  if (request.method === "POST") {
    const body = await readReportBody(request);
    const reportedUrlId = String(body.reportedUrlId || "").trim();
    const action = String(body.action || "").trim();
    const nextStatus = {
      complete: "confirmed_malicious",
      hold: "under_review",
      revert: "rejected",
    }[action];

    if (!reportedUrlId || !nextStatus) {
      return sendJson(400, { error: "변경할 신고와 처리 상태를 확인해 주세요." });
    }

    const updated = await updateReportedUrlStatus(db, reportedUrlId, nextStatus);
    if (!updated) {
      return sendJson(404, { error: "신고 URL을 찾을 수 없습니다." });
    }

    return sendJson(200, {
      communityReport: serializeCommunityReport(updated),
      reportedUrlId,
    });
  }

  return sendJson(405, { error: "Method not allowed" });
}

export async function getCommunityReportForUrls(urls, env = {}) {
  const db = getCommunityDb(env, { optional: true });

  if (!db) {
    return buildEmptyCommunityReport();
  }

  const normalizedUrls = [...new Set((urls || []).map(normalizeUrlForLookup).filter(Boolean))];

  if (normalizedUrls.length === 0) {
    return buildEmptyCommunityReport();
  }

  const hashes = [];
  for (const url of normalizedUrls) {
    hashes.push(await sha256Hex(url));
  }

  const hashPlaceholders = hashes.map(() => "?").join(", ");
  const urlPlaceholders = normalizedUrls.map(() => "?").join(", ");
  const query = `SELECT
      id,
      original_url,
      normalized_url,
      final_url,
      domain,
      url_hash,
      report_type,
      report_count,
      unique_reporters,
      confidence_score,
      status,
      created_at,
      updated_at
    FROM reported_urls
    WHERE url_hash IN (${hashPlaceholders})
       OR normalized_url IN (${urlPlaceholders})
       OR final_url IN (${urlPlaceholders})
    ORDER BY
      CASE status
        WHEN 'confirmed_malicious' THEN 5
        WHEN 'confirmed_suspicious' THEN 4
        WHEN 'under_review' THEN 3
        WHEN 'pending' THEN 2
        ELSE 1
      END DESC,
      report_count DESC,
      updated_at DESC
    LIMIT 8`;
  const result = await db.prepare(query).bind(...hashes, ...normalizedUrls, ...normalizedUrls).all();
  const rows = result.results || [];

  if (rows.length === 0) {
    return buildEmptyCommunityReport();
  }

  return mergeCommunityReports(rows.map(serializeCommunityReport));
}

async function listAdminReporters(db) {
  const result = await db
    .prepare(
      `SELECT
        report_events.id AS event_id,
        report_events.report_type AS event_report_type,
        report_events.description,
        report_events.evidence_image_url,
        report_events.created_at AS event_created_at,
        report_events.reporter_user_id,
        report_events.reporter_ip_hash,
        users.username,
        reported_urls.id AS reported_url_id,
        reported_urls.original_url,
        reported_urls.normalized_url,
        reported_urls.final_url,
        reported_urls.domain,
        reported_urls.report_type,
        reported_urls.report_count,
        reported_urls.unique_reporters,
        reported_urls.confidence_score,
        reported_urls.status,
        reported_urls.created_at AS url_created_at,
        reported_urls.updated_at AS url_updated_at
      FROM report_events
      INNER JOIN reported_urls ON reported_urls.id = report_events.reported_url_id
      LEFT JOIN users ON users.id = report_events.reporter_user_id
      ORDER BY report_events.created_at DESC
      LIMIT 300`,
    )
    .all();
  const reporters = new Map();

  for (const row of result.results || []) {
    const reporterKey = row.reporter_user_id || `anonymous:${String(row.reporter_ip_hash || "").slice(0, 12)}`;
    const reporterLabel = row.username || "비로그인 신고";
    const current = reporters.get(reporterKey) || {
      latestReportAt: "",
      reportCount: 0,
      reporterId: row.reporter_user_id || "",
      reporterKey,
      reporterLabel,
      reports: [],
    };
    const report = {
      confidenceScore: Number(row.confidence_score || 0),
      createdAt: row.event_created_at,
      description: row.description || "",
      domain: row.domain || "",
      evidenceImageUrl: row.evidence_image_url || "",
      eventId: row.event_id,
      finalUrl: row.final_url || "",
      normalizedUrl: row.normalized_url || "",
      originalUrl: row.original_url || "",
      reportCount: Number(row.report_count || 0),
      reportedUrlId: row.reported_url_id,
      reportType: normalizeReportType(row.event_report_type) || normalizeReportType(row.report_type) || "other",
      status: REPORT_STATUSES.has(row.status) ? row.status : "pending",
      uniqueReporters: Number(row.unique_reporters || 0),
      updatedAt: row.url_updated_at || row.event_created_at,
    };

    current.reports.push(report);
    current.reportCount += 1;
    current.latestReportAt = [current.latestReportAt, report.createdAt].filter(Boolean).sort().at(-1) || report.createdAt;
    reporters.set(reporterKey, current);
  }

  return [...reporters.values()].sort((left, right) =>
    String(right.latestReportAt || "").localeCompare(String(left.latestReportAt || "")),
  );
}

async function updateReportedUrlStatus(db, reportedUrlId, status) {
  const now = new Date().toISOString();
  const confidenceScore = status === "confirmed_malicious" ? 100 : status === "under_review" ? 70 : 0;

  await db
    .prepare("UPDATE reported_urls SET status = ?, confidence_score = ?, updated_at = ? WHERE id = ?")
    .bind(status, confidenceScore, now, reportedUrlId)
    .run();

  return db.prepare("SELECT * FROM reported_urls WHERE id = ? LIMIT 1").bind(reportedUrlId).first();
}

export function buildEmptyCommunityReport() {
  return {
    confidenceScore: 0,
    hasReports: false,
    lastReportedAt: "",
    matchedUrls: [],
    primaryReportType: "",
    reportCount: 0,
    score: 0,
    status: "none",
    uniqueReporters: 0,
  };
}

export function mergeCommunityReports(reports = []) {
  const activeReports = reports.filter((report) => report?.hasReports);

  if (activeReports.length === 0) {
    return buildEmptyCommunityReport();
  }

  const sorted = activeReports.slice().sort((left, right) => {
    const statusDelta = statusRank(right.status) - statusRank(left.status);
    if (statusDelta) {
      return statusDelta;
    }

    const scoreDelta = Number(right.score || 0) - Number(left.score || 0);
    if (scoreDelta) {
      return scoreDelta;
    }

    return String(right.lastReportedAt || "").localeCompare(String(left.lastReportedAt || ""));
  });
  const strongest = sorted[0];
  const reportCount = activeReports.reduce((sum, item) => sum + Number(item.reportCount || 0), 0);
  const uniqueReporters = activeReports.reduce((sum, item) => sum + Number(item.uniqueReporters || 0), 0);
  const matchedUrls = [...new Set(activeReports.flatMap((item) => item.matchedUrls || []).filter(Boolean))].slice(0, 8);

  return {
    ...strongest,
    confidenceScore: Math.max(...activeReports.map((item) => Number(item.confidenceScore || 0))),
    hasReports: true,
    lastReportedAt: activeReports
      .map((item) => item.lastReportedAt)
      .filter(Boolean)
      .sort()
      .at(-1) || strongest.lastReportedAt,
    matchedUrls,
    reportCount,
    score: Math.max(...activeReports.map((item) => Number(item.score || 0))),
    uniqueReporters,
  };
}

export function serializeCommunityReport(row) {
  const status = REPORT_STATUSES.has(row?.status) ? row.status : "pending";
  const reportCount = Number(row?.report_count || row?.reportCount || 0);
  const uniqueReporters = Number(row?.unique_reporters || row?.uniqueReporters || 0);
  const confidenceScore = clampNumber(Number(row?.confidence_score || row?.confidenceScore || 0), 0, 100);
  const report = {
    confidenceScore,
    hasReports: reportCount > 0,
    lastReportedAt: row?.updated_at || row?.updatedAt || "",
    matchedUrls: [row?.normalized_url || row?.normalizedUrl, row?.final_url || row?.finalUrl].filter(Boolean),
    primaryReportType: normalizeReportType(row?.report_type || row?.primaryReportType) || "other",
    reportCount,
    status,
    uniqueReporters,
  };

  return {
    ...report,
    score: scoreCommunityReport(report),
  };
}

export function scoreCommunityReport(report) {
  if (!report?.hasReports || report.status === "rejected" || report.status === "expired") {
    return 0;
  }

  if (report.status === "confirmed_malicious") {
    return 100;
  }

  if (report.status === "confirmed_suspicious") {
    return 78;
  }

  const volumeScore = Math.min(42, Number(report.reportCount || 0) * 7);
  const reporterScore = Math.min(28, Number(report.uniqueReporters || 0) * 9);
  const reviewScore = report.status === "under_review" ? 18 : 0;
  const confidenceScore = Math.min(22, Number(report.confidenceScore || 0) * 0.22);

  return Math.round(clampNumber(volumeScore + reporterScore + reviewScore + confidenceScore, 0, 72));
}

async function refreshReportedUrlAggregate(db, reportedUrlId) {
  const aggregate = await db
    .prepare(
      `SELECT
        COUNT(*) AS report_count,
        COUNT(DISTINCT reporter_ip_hash) AS unique_reporters,
        MAX(created_at) AS updated_at
      FROM report_events
      WHERE reported_url_id = ?`,
    )
    .bind(reportedUrlId)
    .first();
  const topType = await db
    .prepare(
      `SELECT report_type, COUNT(*) AS type_count
      FROM report_events
      WHERE reported_url_id = ?
      GROUP BY report_type
      ORDER BY type_count DESC, MAX(created_at) DESC
      LIMIT 1`,
    )
    .bind(reportedUrlId)
    .first();
  const current = await db.prepare("SELECT status FROM reported_urls WHERE id = ?").bind(reportedUrlId).first();
  const reportCount = Number(aggregate?.report_count || 0);
  const uniqueReporters = Number(aggregate?.unique_reporters || 0);
  const confidenceScore = calculateAggregateConfidence({
    reportCount,
    status: current?.status || "pending",
    uniqueReporters,
  });

  await db
    .prepare(
      `UPDATE reported_urls
      SET report_type = ?,
          report_count = ?,
          unique_reporters = ?,
          confidence_score = ?,
          updated_at = ?
      WHERE id = ?`,
    )
    .bind(
      normalizeReportType(topType?.report_type) || "other",
      reportCount,
      uniqueReporters,
      confidenceScore,
      aggregate?.updated_at || new Date().toISOString(),
      reportedUrlId,
    )
    .run();

  return db.prepare("SELECT * FROM reported_urls WHERE id = ?").bind(reportedUrlId).first();
}

function calculateAggregateConfidence({ reportCount, status, uniqueReporters }) {
  if (status === "confirmed_malicious") {
    return 100;
  }

  if (status === "confirmed_suspicious") {
    return 82;
  }

  if (status === "rejected" || status === "expired") {
    return 0;
  }

  return Math.round(clampNumber(reportCount * 8 + uniqueReporters * 12 + (status === "under_review" ? 16 : 0), 0, 70));
}

async function checkReportRateLimits(db, { reporterIpHash, since }) {
  const recent = await db
    .prepare("SELECT COUNT(*) AS count FROM report_events WHERE reporter_ip_hash = ? AND created_at >= ?")
    .bind(reporterIpHash, since)
    .first();

  return Number(recent?.count || 0) >= MAX_REPORTS_PER_WINDOW
    ? "짧은 시간에 신고가 너무 많습니다. 잠시 후 다시 시도해 주세요."
    : "";
}

async function findReportedUrlByHash(db, urlHash) {
  return db.prepare("SELECT * FROM reported_urls WHERE url_hash = ? LIMIT 1").bind(urlHash).first();
}

async function readReportBody(request) {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    return {
      description: form.get("description"),
      evidenceImage: form.get("evidenceImage"),
      privacyConfirmed: form.get("privacyConfirmed"),
      reportType: form.get("reportType"),
      turnstileToken: form.get("turnstileToken"),
      url: form.get("url"),
    };
  }

  const text = await request.text();

  if (new TextEncoder().encode(text).byteLength > REQUEST_LIMIT_BYTES) {
    const error = new Error("Request body too large");
    error.statusCode = 413;
    throw error;
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function validateReportUrl(rawUrl) {
  const analysis = analyzeUrl(String(rawUrl || ""));

  if (!analysis.displayUrl || analysis.verdict === "idle" || analysis.verdict === "invalid") {
    return { error: "신고할 URL 형식을 확인해 주세요.", ok: false };
  }

  if (analysis.verdict === "blocked" || analysis.safetyCheck?.safe === false) {
    return { error: "내부망, 로컬 주소 등 안전하지 않은 대상은 신고할 수 없습니다.", ok: false };
  }

  return {
    domain: analysis.registrableDomain || new URL(analysis.displayUrl).hostname,
    normalizedUrl: normalizeUrlForLookup(analysis.displayUrl),
    ok: true,
    originalUrl: String(rawUrl || "").trim(),
  };
}

async function verifyTurnstileToken(token, request, env = {}) {
  const secret = readEnv(env, "TURNSTILE_SECRET_KEY");

  if (!secret) {
    return { ok: true, skipped: true };
  }

  if (!token) {
    return { error: "CAPTCHA 확인을 완료해 주세요.", ok: false };
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    body: new URLSearchParams({
      remoteip: getClientIp(request),
      response: String(token),
      secret,
    }),
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  return payload.success ? { ok: true } : { error: "CAPTCHA 확인에 실패했습니다. 다시 시도해 주세요.", ok: false };
}

async function storeEvidenceImage(file, env = {}) {
  if (!isFileLike(file) || Number(file.size || 0) === 0) {
    return "";
  }

  const mimeType = String(file.type || "").toLowerCase();
  const extension = getFileExtension(file.name);

  if (BLOCKED_IMAGE_EXTENSIONS.has(extension) || !IMAGE_TYPES.has(mimeType)) {
    const error = new Error("스크린샷은 jpg, png, webp 파일만 첨부할 수 있습니다.");
    error.statusCode = 400;
    throw error;
  }

  if (Number(file.size || 0) > MAX_IMAGE_BYTES) {
    const error = new Error("스크린샷은 5MB 이하로 첨부해 주세요.");
    error.statusCode = 400;
    throw error;
  }

  const bucket = env.REPORT_EVIDENCE_BUCKET;
  if (!bucket || typeof bucket.put !== "function") {
    return readEnv(env, "REPORT_EVIDENCE_INLINE") === "true" ? await encodeEvidenceDataUrl(file, mimeType) : "";
  }

  const key = `report-evidence/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${IMAGE_TYPES.get(mimeType)}`;
  await bucket.put(key, file.stream(), {
    httpMetadata: {
      contentType: mimeType,
    },
  });

  const publicBaseUrl = readEnv(env, "REPORT_EVIDENCE_PUBLIC_BASE_URL").replace(/\/+$/, "");
  return publicBaseUrl ? `${publicBaseUrl}/${key}` : `r2://${key}`;
}

async function encodeEvidenceDataUrl(file, mimeType) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${mimeType};base64,${encodeBase64(bytes)}`;
}

function encodeBase64(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  throw new Error("No base64 encoder is available in this runtime.");
}

async function readReporterUserId(request, db) {
  const token = readCookie(request, AUTH_COOKIE);

  if (!token) {
    return "";
  }

  try {
    const tokenHash = await sha256Hex(token);
    const row = await db
      .prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ? LIMIT 1")
      .bind(tokenHash, new Date().toISOString())
      .first();
    return row?.user_id || "";
  } catch {
    return "";
  }
}

async function readDeveloperSession(request, db) {
  const token = readCookie(request, AUTH_COOKIE);

  if (!token) {
    return null;
  }

  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT
        users.id,
        users.username,
        users.username_lower
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      LIMIT 1`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first();

  if (!row || !DEVELOPER_USERNAMES.has(String(row.username_lower || row.username || "").toLocaleLowerCase("ko-KR"))) {
    return null;
  }

  return row;
}

async function hashReporterIp(ip, env = {}) {
  const secret = readEnv(env, "REPORT_IP_HASH_SECRET") || "linkguard-community-report-ip";
  return sha256Hex(`${secret}:${ip || "unknown"}`);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeUrlForLookup(rawUrl) {
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

function normalizeReportType(value) {
  const reportType = String(value || "").trim();
  return REPORT_TYPES.has(reportType) ? reportType : "";
}

function normalizeDescription(value) {
  return String(value || "").trim().slice(0, MAX_DESCRIPTION_LENGTH);
}

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("X-Real-IP") ||
    ""
  );
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";

  for (const cookie of header.split(";")) {
    const [rawKey, ...rawValue] = cookie.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return "";
}

function isFileLike(file) {
  return Boolean(file && typeof file === "object" && typeof file.name === "string" && typeof file.size === "number");
}

function getFileExtension(fileName = "") {
  const match = String(fileName || "").toLowerCase().match(/\.[^.]+$/);
  return match?.[0] || "";
}

function statusRank(status) {
  return {
    confirmed_malicious: 5,
    confirmed_suspicious: 4,
    under_review: 3,
    pending: 2,
    expired: 1,
    rejected: 0,
  }[status] || 0;
}

function getCommunityDb(env = {}, { optional }) {
  if (env.DB) {
    return env.DB;
  }

  if (optional) {
    return null;
  }

  const error = new Error("신고 데이터베이스가 연결되어 있지 않습니다.");
  error.statusCode = 503;
  throw error;
}

function readEnv(env, key) {
  if (env && Object.prototype.hasOwnProperty.call(env, key)) {
    return String(env[key] || "").trim();
  }

  return "";
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
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
